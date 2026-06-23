-- Migration 039: crew & labor tracking
--
-- Makes the install crew first-class entities (independent of dashboard
-- logins), lets us assign crew to jobs by day, and logs labor hours that
-- roll up into job-cost actuals for true job costing / a payroll basis.
--
-- WHY a separate crew_members table instead of profiles: profiles.id is a FK
-- to auth.users and is auto-created by the handle_new_user() trigger, so every
-- profile needs a login + email. Most crew (Elmer, Johnny, Walter, Frank,
-- Josue) never log in. Christian logs in AND installs, so his crew_members row
-- links back to his profile via profile_id.
--
-- Idempotent — safe to re-run.

-- ============================================================
-- 1. Crew members
-- ============================================================
CREATE TABLE IF NOT EXISTS crew_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  nickname TEXT,                                  -- short label for the compact week grid
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'installer',         -- free text: installer | lead | helper
  day_rate NUMERIC(10,2) NOT NULL DEFAULT 250,    -- matches the estimator's "Day Rate (per tiler)"
  hour_rate NUMERIC(10,2),                         -- optional; if null the API derives day_rate / 8
  is_active BOOLEAN NOT NULL DEFAULT true,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- null = no dashboard login
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One crew row per login at most (Christian); installers have profile_id NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_crew_members_profile
  ON crew_members(profile_id) WHERE profile_id IS NOT NULL;

DROP TRIGGER IF EXISTS crew_members_updated_at ON crew_members;
CREATE TRIGGER crew_members_updated_at
  BEFORE UPDATE ON crew_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Team read crew_members" ON crew_members;
CREATE POLICY "Team read crew_members" ON crew_members FOR SELECT TO authenticated USING (is_team_member());
DROP POLICY IF EXISTS "Owner manage crew_members" ON crew_members;
CREATE POLICY "Owner manage crew_members" ON crew_members FOR ALL TO authenticated USING (is_owner()) WITH CHECK (is_owner());

-- Seed the six known crew (idempotent on full_name). Rates are placeholders —
-- confirm per-person rates (Christian likely differs from the installers).
INSERT INTO crew_members (full_name, nickname, role)
SELECT v.full_name, v.nickname, v.role
FROM (VALUES
  ('Christian', 'Christian', 'lead'),
  ('Elmer',     'Elmer',     'installer'),
  ('Johnny',    'Johnny',    'installer'),
  ('Walter',    'Walter',    'installer'),
  ('Frank',     'Frank',     'installer'),
  ('Josue',     'Josue',     'installer')
) AS v(full_name, nickname, role)
WHERE NOT EXISTS (
  SELECT 1 FROM crew_members c WHERE c.full_name = v.full_name
);

-- ============================================================
-- 2. Crew assignments (one crew member, one job, one day)
-- ============================================================
-- jobs.assigned_to stays the owning lead. This table is additive and supports
-- many crew per job per day, and one crew member across different jobs/days.
CREATE TABLE IF NOT EXISTS crew_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  crew_member_id UUID NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, crew_member_id, work_date)      -- can't double-book the same person/job/day
);

CREATE INDEX IF NOT EXISTS idx_crew_assign_job  ON crew_assignments(job_id);
CREATE INDEX IF NOT EXISTS idx_crew_assign_date ON crew_assignments(work_date);
CREATE INDEX IF NOT EXISTS idx_crew_assign_crew ON crew_assignments(crew_member_id, work_date);

ALTER TABLE crew_assignments ENABLE ROW LEVEL SECURITY;
-- Team manage (not owner-only) so Christian can assign crew from the field.
DROP POLICY IF EXISTS "Team read crew_assignments" ON crew_assignments;
CREATE POLICY "Team read crew_assignments" ON crew_assignments FOR SELECT TO authenticated USING (is_team_member());
DROP POLICY IF EXISTS "Team manage crew_assignments" ON crew_assignments;
CREATE POLICY "Team manage crew_assignments" ON crew_assignments FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

-- ============================================================
-- 3. Labor entries (hours per crew member per job per day)
-- ============================================================
-- rate_applied + labor_cost are snapshotted at write time so a later rate edit
-- never silently rewrites payroll history (same pattern the estimator uses to
-- snapshot warranty_text / payment_terms_text onto a job).
CREATE TABLE IF NOT EXISTS labor_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  crew_member_id UUID NOT NULL REFERENCES crew_members(id) ON DELETE RESTRICT,
  work_date DATE NOT NULL,
  hours NUMERIC(5,2) NOT NULL DEFAULT 8 CHECK (hours >= 0 AND hours <= 24),
  rate_applied NUMERIC(10,2) NOT NULL,            -- snapshot of the hourly rate used
  labor_cost NUMERIC(10,2) NOT NULL,              -- hours * rate_applied, computed in the API
  note TEXT,
  logged_by UUID REFERENCES profiles(id),         -- null when logged via the crew token link
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, crew_member_id, work_date)      -- one timesheet row per person/job/day; edits update it
);

CREATE INDEX IF NOT EXISTS idx_labor_entries_job  ON labor_entries(job_id);
CREATE INDEX IF NOT EXISTS idx_labor_entries_crew ON labor_entries(crew_member_id, work_date);

DROP TRIGGER IF EXISTS labor_entries_updated_at ON labor_entries;
CREATE TRIGGER labor_entries_updated_at
  BEFORE UPDATE ON labor_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE labor_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Team read labor_entries" ON labor_entries;
CREATE POLICY "Team read labor_entries" ON labor_entries FOR SELECT TO authenticated USING (is_team_member());
DROP POLICY IF EXISTS "Team manage labor_entries" ON labor_entries;
CREATE POLICY "Team manage labor_entries" ON labor_entries FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

-- ============================================================
-- 4. Job cost actuals split
-- ============================================================
-- We keep actual_cost as the headline figure but split it so logged labor can
-- flow into it without us guessing what's already there. actual_materials_cost
-- holds everything that is NOT labor; the labor API maintains actual_labor_cost
-- and rewrites actual_cost = actual_materials_cost + actual_labor_cost.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS actual_labor_cost NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS actual_materials_cost NUMERIC(10,2);

-- Non-destructive backfill: treat any existing actual_cost as the materials/
-- non-labor baseline so the rollup below leaves current actual_cost unchanged
-- until labor hours are logged.
UPDATE jobs
  SET actual_materials_cost = actual_cost
  WHERE actual_cost IS NOT NULL AND actual_materials_cost IS NULL;
