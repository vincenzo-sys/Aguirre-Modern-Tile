-- Migration 033: Custom calendar events.
--
-- Construction jobs don't always go according to plan. A glass-door follow-up
-- pops up at 6pm tonight; an inspection has to happen Thursday morning; a
-- supplier pickup gets squeezed in between two installs. None of these belong
-- in the jobs table — they aren't sales-pipeline entities, they don't carry
-- estimates or invoices, and forcing them into a job status would pollute
-- Leads/Kanban/revenue dashboards.
--
-- This table backs the "+ Add event" affordance on the calendar so Vince can
-- drop ad-hoc happenings on the schedule and Christian sees them alongside
-- the regular job blocks. Optional job_id/customer_id links let an event
-- pull address + phone from the existing record so the crew can tap through
-- to "where am I going / who do I call."
--
-- Time model:
--   - start_at / end_at are timestamptz, so events carry a real time-of-day
--     ("tonight at 6pm").
--   - all_day=true means the time component is decorative; renderers should
--     show the date only and ignore the clock. We still store timestamptz
--     (with time set to local midnight at insert) rather than separating
--     date+time fields, because it keeps range queries trivial.

CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(title) > 0 AND length(title) <= 200),
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  all_day boolean NOT NULL DEFAULT false,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  notes text,
  -- Tailwind-ish color name ('blue', 'green', etc.) used by the renderer to
  -- pick a pill style. Free text rather than enum so we can add new colors
  -- without a migration; the UI clamps to a known set.
  color text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_events_end_after_start CHECK (end_at IS NULL OR end_at >= start_at)
);

-- Calendar view loads "events that overlap [month_start, month_end)". A btree
-- on start_at handles the common case (events starting in the visible window);
-- multi-day events that started earlier are rare enough that a small extra
-- query covers them.
CREATE INDEX IF NOT EXISTS calendar_events_start_at_idx
  ON calendar_events (start_at);

-- For "show me everything tied to this job" on the job detail page later.
CREATE INDEX IF NOT EXISTS calendar_events_job_id_idx
  ON calendar_events (job_id) WHERE job_id IS NOT NULL;

-- updated_at trigger so PATCHes bump the timestamp without the API needing to.
CREATE OR REPLACE FUNCTION calendar_events_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calendar_events_updated_at ON calendar_events;
CREATE TRIGGER calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION calendar_events_set_updated_at();

COMMENT ON TABLE calendar_events IS
  'Ad-hoc calendar entries (follow-ups, supplier runs, inspections) that are not jobs. Renders alongside jobs on the dashboard calendar.';
