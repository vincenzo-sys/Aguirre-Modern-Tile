-- Migration 048: job_estimates — quote OPTIONS (Good/Better/Best) + VERSION HISTORY.
-- Run once (CREATE POLICY is not idempotent): node scripts/run-migration.mjs
--
-- Context: there is no `estimates` table in this system — an estimate IS a jobs
-- row. Every downstream consumer reads the job: the Stripe deposit is 10% of
-- jobs.estimated_cost, invoices pre-populate from jobs.line_items, and the crew
-- work-order view reads jobs.line_items. Two consequences:
--
--   1. Quote history did not exist. /api/estimates/generate overwrites
--      jobs.line_items in place, and so does every PATCH /api/jobs/[id] that
--      touches line_items. The prior estimate was destroyed on every edit, so
--      "what changed since last week?" was unanswerable.
--   2. A job could only ever carry ONE price, so options could not be offered.
--
-- Rather than move the estimate out of `jobs` (which would detonate across
-- Stripe, invoicing and work orders), this table sits BESIDE the job and
-- MIRRORS onto it. jobs.* always holds the SELECTED estimate; accepting a
-- different option copies that option's payload back onto the job. Every
-- existing consumer keeps working untouched.
--
-- This is the same principle 029_estimate_defaults (warranty/payment text
-- frozen onto the job at generate-time) and 039_crew_labor (rate_applied
-- frozen at write time) already commit to — a sent estimate is a historical
-- fact, not a live query — applied at row granularity instead of column.
--
-- MODEL: append-only. Rows sharing (job_id, option_key) are successive VERSIONS
-- of the same customer-facing OPTION.
--
--   the options a customer sees  ->  WHERE job_id = ? AND is_current  ORDER BY sort_order
--   history of one option        ->  WHERE job_id = ? AND option_key = ?  ORDER BY version
--   what jobs.* mirrors          ->  the single row WHERE job_id = ? AND is_primary
--
-- Nothing is ever updated destructively and nothing is ever deleted, so a
-- customer-visible changelog later is a query over rows that already exist.

CREATE TABLE job_estimates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  -- Option identity. Rows sharing (job_id, option_key) are versions of the
  -- SAME customer-facing option. 'a' is the default/only option for every job
  -- that predates this migration.
  option_key  TEXT    NOT NULL DEFAULT 'a',
  label       TEXT    NOT NULL DEFAULT 'Standard',  -- 'Standard' / 'Upgraded' / 'Premium'
  blurb       TEXT,                                 -- one-line "why this one", shown to customer
  sort_order  INTEGER NOT NULL DEFAULT 0,

  version     INTEGER NOT NULL DEFAULT 1,
  is_current  BOOLEAN NOT NULL DEFAULT true,        -- newest version of this option
  is_primary  BOOLEAN NOT NULL DEFAULT false,       -- the option currently mirrored onto jobs.*
  -- Customer clicked Accept on this option. Distinct from jobs.estimate_accepted_at,
  -- which means the deposit actually cleared (set by the Stripe webhook). A
  -- customer who picks Premium then abandons checkout leaves useful sales
  -- signal without the job being falsely marked accepted.
  selected_at TIMESTAMPTZ,
  change_note TEXT,                                 -- why this revision exists

  -- Frozen payload: exactly the columns /api/estimates/generate writes to jobs.
  line_items         JSONB NOT NULL DEFAULT '[]',
  scopes             JSONB NOT NULL DEFAULT '[]',
  scope_notes        TEXT,
  estimated_cost     NUMERIC(10,2),
  estimated_days     INTEGER,
  margin_percent     NUMERIC(5,2),                  -- INTERNAL — never send to the customer page
  customer_provides  TEXT,
  warranty_text      TEXT,
  payment_terms_text TEXT,
  payment_methods    JSONB,

  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()    -- moves only when a version is coalesced
);

-- Version numbers are dense and unique within an option.
CREATE UNIQUE INDEX job_estimates_version_key ON job_estimates (job_id, option_key, version);
-- Exactly one live version per option, and exactly one primary option per job.
-- These are the invariants record_job_estimate_version() must not break, which
-- is why the demote and the insert have to commit together.
CREATE UNIQUE INDEX job_estimates_one_current ON job_estimates (job_id, option_key) WHERE is_current;
CREATE UNIQUE INDEX job_estimates_one_primary ON job_estimates (job_id) WHERE is_primary;
CREATE INDEX job_estimates_job_idx ON job_estimates (job_id, sort_order, version DESC);

-- RLS mirrors jobs (schema.sql:149-152). The API routes use the service-role
-- client and bypass this; it is defense in depth for any direct client read.
ALTER TABLE job_estimates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team read job_estimates" ON job_estimates
  FOR SELECT TO authenticated USING (is_team_member());
CREATE POLICY "Owner manage job_estimates" ON job_estimates
  FOR ALL TO authenticated USING (is_owner()) WITH CHECK (is_owner());


-- ─────────────────────────────────────────────────────────────────────────────
-- record_job_estimate_version — append a version capturing the job's CURRENT
-- estimate state. Called after a successful mutation to jobs, so the row
-- sequence IS the history and there is no snapshot-ordering subtlety.
--
-- Atomic by necessity: job_estimates_one_current and job_estimates_one_primary
-- are partial UNIQUE indexes, so "demote the old row" and "insert the new one"
-- must land in one transaction. Same reasoning as record_deposit (045).
--
-- COALESCING: Vince nudging one line item six times should be ONE revision, not
-- six — a history list full of noise is worse than no history. Consecutive
-- edits by the same actor inside p_coalesce_seconds fold into the current row.
-- The hard exception is a send: once the customer has SEEN a number, that
-- revision is a historical fact, so the next edit always branches. Pass
-- p_coalesce_seconds => 0 to force a new version.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_job_estimate_version(
  p_job_id           UUID,
  p_option_key       TEXT    DEFAULT NULL,  -- NULL = whichever option is primary
  p_change_note      TEXT    DEFAULT NULL,
  p_created_by       UUID    DEFAULT NULL,
  p_coalesce_seconds INTEGER DEFAULT 600,
  -- Partial estimate payload. NULL (the default) means "capture whatever is on
  -- the job right now", which is the flow for the primary option — the caller
  -- has already written to jobs and this records what landed.
  --
  -- Non-NULL inverts the direction: the payload is the source of truth and is
  -- MIRRORED onto jobs when the target option is primary. That is what lets a
  -- secondary option (the "Upgraded" quote) be edited without disturbing the
  -- price the rest of the system reads off the job. Only the keys present are
  -- applied, so callers can PATCH one field.
  p_payload          JSONB   DEFAULT NULL
)
RETURNS TABLE (estimate_id UUID, estimate_version INTEGER, was_coalesced BOOLEAN)
LANGUAGE plpgsql AS $$
DECLARE
  v_job        jobs%ROWTYPE;
  v_cur        job_estimates%ROWTYPE;
  v_key        TEXT;
  v_primary_id UUID;
  v_is_primary BOOLEAN;
  v_next       INTEGER;
  v_new_id     UUID;
  -- Resolved payload, from either the job or p_payload.
  v_line_items JSONB;
  v_scopes     JSONB;
  v_notes      TEXT;
  v_cost       NUMERIC(10,2);
  v_days       INTEGER;
  v_margin     NUMERIC(5,2);
  v_provides   TEXT;
  v_warranty   TEXT;
  v_terms      TEXT;
  v_methods    JSONB;
BEGIN
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_job_estimate_version: job % not found', p_job_id;
  END IF;

  -- Which option are we versioning? Explicit key wins; else the job's primary
  -- option; else 'a' (first-ever version for this job).
  v_key := p_option_key;
  IF v_key IS NULL THEN
    SELECT je.option_key INTO v_key
      FROM job_estimates je
     WHERE je.job_id = p_job_id AND je.is_primary;
  END IF;
  v_key := COALESCE(v_key, 'a');

  SELECT * INTO v_cur
    FROM job_estimates je
   WHERE je.job_id = p_job_id AND je.option_key = v_key AND je.is_current;

  -- ── Resolve the payload. Either the job is the source (p_payload NULL) or
  -- the caller is, in which case absent keys fall back to the option's current
  -- values so a one-field PATCH doesn't blank the rest of the quote.
  IF p_payload IS NULL THEN
    v_line_items := v_job.line_items;
    v_scopes     := v_job.scopes;
    v_notes      := v_job.scope_notes;
    v_cost       := v_job.estimated_cost;
    v_days       := v_job.estimated_days;
    v_margin     := v_job.margin_percent;
    v_provides   := v_job.customer_provides;
    v_warranty   := v_job.warranty_text;
    v_terms      := v_job.payment_terms_text;
    v_methods    := v_job.payment_methods;
  ELSE
    v_line_items := CASE WHEN p_payload ? 'line_items'
                    THEN p_payload->'line_items' ELSE COALESCE(v_cur.line_items, '[]'::jsonb) END;
    v_scopes     := CASE WHEN p_payload ? 'scopes'
                    THEN p_payload->'scopes' ELSE COALESCE(v_cur.scopes, '[]'::jsonb) END;
    v_notes      := CASE WHEN p_payload ? 'scope_notes'
                    THEN p_payload->>'scope_notes' ELSE v_cur.scope_notes END;
    v_days       := CASE WHEN p_payload ? 'estimated_days'
                    THEN (p_payload->>'estimated_days')::INTEGER ELSE v_cur.estimated_days END;
    v_margin     := CASE WHEN p_payload ? 'margin_percent'
                    THEN (p_payload->>'margin_percent')::NUMERIC ELSE v_cur.margin_percent END;
    v_provides   := CASE WHEN p_payload ? 'customer_provides'
                    THEN p_payload->>'customer_provides' ELSE v_cur.customer_provides END;
    v_warranty   := CASE WHEN p_payload ? 'warranty_text'
                    THEN p_payload->>'warranty_text' ELSE v_cur.warranty_text END;
    v_terms      := CASE WHEN p_payload ? 'payment_terms_text'
                    THEN p_payload->>'payment_terms_text' ELSE v_cur.payment_terms_text END;
    v_methods    := CASE WHEN p_payload ? 'payment_methods'
                    THEN p_payload->'payment_methods' ELSE v_cur.payment_methods END;

    -- Keep the total honest with the lines, mirroring the auto-sum that
    -- /api/jobs/[id] already applies (route.ts:96-102) so an option's price
    -- and its line items can never drift apart.
    IF p_payload ? 'estimated_cost' THEN
      v_cost := (p_payload->>'estimated_cost')::NUMERIC;
    ELSIF p_payload ? 'line_items' THEN
      SELECT ROUND(COALESCE(SUM((li->>'amount')::NUMERIC), 0), 2)
        INTO v_cost FROM jsonb_array_elements(v_line_items) li;
    ELSE
      v_cost := v_cur.estimated_cost;
    END IF;
  END IF;

  -- ── Fold into the current version instead of branching?
  IF v_cur.id IS NOT NULL
     AND p_coalesce_seconds > 0
     AND v_cur.created_at > NOW() - make_interval(secs => p_coalesce_seconds)
     AND v_cur.created_by IS NOT DISTINCT FROM p_created_by
     AND (v_job.estimate_sent_at IS NULL OR v_job.estimate_sent_at < v_cur.created_at)
  THEN
    UPDATE job_estimates SET
      line_items         = v_line_items,
      scopes             = v_scopes,
      scope_notes        = v_notes,
      estimated_cost     = v_cost,
      estimated_days     = v_days,
      margin_percent     = v_margin,
      customer_provides  = v_provides,
      warranty_text      = v_warranty,
      payment_terms_text = v_terms,
      payment_methods    = v_methods,
      change_note        = COALESCE(p_change_note, v_cur.change_note),
      updated_at         = NOW()
    WHERE id = v_cur.id;

    IF p_payload IS NOT NULL AND v_cur.is_primary THEN
      PERFORM mirror_estimate_to_job(p_job_id, v_cur.id);
    END IF;

    RETURN QUERY SELECT v_cur.id, v_cur.version, true;
    RETURN;
  END IF;

  -- ── Branch a new version.
  -- The new row inherits primacy when it supersedes the primary option, or
  -- when the job has no primary at all (first version ever).
  SELECT je.id INTO v_primary_id
    FROM job_estimates je
   WHERE je.job_id = p_job_id AND je.is_primary;

  v_is_primary := (v_primary_id IS NULL)
               OR (v_cur.id IS NOT NULL AND v_primary_id = v_cur.id);

  SELECT COALESCE(MAX(je.version), 0) + 1 INTO v_next
    FROM job_estimates je
   WHERE je.job_id = p_job_id AND je.option_key = v_key;

  -- Demote BEFORE inserting so the partial unique indexes never see two rows.
  UPDATE job_estimates SET is_current = false
   WHERE job_id = p_job_id AND option_key = v_key AND is_current;

  IF v_is_primary THEN
    UPDATE job_estimates SET is_primary = false
     WHERE job_id = p_job_id AND is_primary;
  END IF;

  INSERT INTO job_estimates (
    job_id, option_key, label, blurb, sort_order,
    version, is_current, is_primary, change_note,
    line_items, scopes, scope_notes, estimated_cost, estimated_days,
    margin_percent, customer_provides, warranty_text, payment_terms_text,
    payment_methods, created_by
  ) VALUES (
    p_job_id, v_key,
    COALESCE(v_cur.label, 'Standard'),
    v_cur.blurb,
    COALESCE(v_cur.sort_order, 0),
    v_next, true, v_is_primary, p_change_note,
    v_line_items, v_scopes, v_notes, v_cost,
    v_days, v_margin, v_provides,
    v_warranty, v_terms, v_methods,
    p_created_by
  )
  RETURNING id INTO v_new_id;

  IF p_payload IS NOT NULL AND v_is_primary THEN
    PERFORM mirror_estimate_to_job(p_job_id, v_new_id);
  END IF;

  RETURN QUERY SELECT v_new_id, v_next, false;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- mirror_estimate_to_job — copy an option's payload onto jobs.*.
--
-- This is the hinge the whole design turns on. jobs.* stays the single source
-- of truth for the Stripe deposit (10% of estimated_cost), invoice
-- pre-population, and the crew work-order view. Options never replace that —
-- the chosen one is copied ONTO it. Every existing consumer keeps working with
-- no knowledge that options exist.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mirror_estimate_to_job(p_job_id UUID, p_estimate_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v job_estimates%ROWTYPE;
BEGIN
  SELECT * INTO v FROM job_estimates WHERE id = p_estimate_id AND job_id = p_job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mirror_estimate_to_job: estimate % is not on job %', p_estimate_id, p_job_id;
  END IF;

  UPDATE jobs SET
    line_items         = v.line_items,
    scopes             = v.scopes,
    scope_notes        = v.scope_notes,
    estimated_cost     = v.estimated_cost,
    estimated_days     = v.estimated_days,
    margin_percent     = v.margin_percent,
    customer_provides  = v.customer_provides,
    warranty_text      = v.warranty_text,
    payment_terms_text = v.payment_terms_text,
    payment_methods    = v.payment_methods
  WHERE id = p_job_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- set_primary_estimate_option — make one option the active quote.
--
-- Used by "Make primary" in the dashboard and, more importantly, by the public
-- Accept button: the customer's chosen option is promoted onto the job BEFORE
-- the Stripe Checkout session is created, so the deposit is 10% of what they
-- actually picked and the webhook needs no changes at all.
--
-- p_selected marks customer intent (selected_at) as distinct from acceptance —
-- jobs.estimate_accepted_at still only moves when the deposit clears.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_primary_estimate_option(
  p_job_id     UUID,
  p_option_key TEXT,
  p_selected   BOOLEAN DEFAULT false
)
RETURNS TABLE (estimate_id UUID, option_key TEXT, estimated_cost NUMERIC)
LANGUAGE plpgsql AS $$
DECLARE v_target job_estimates%ROWTYPE;
BEGIN
  SELECT * INTO v_target
    FROM job_estimates je
   WHERE je.job_id = p_job_id AND je.option_key = p_option_key AND je.is_current;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_primary_estimate_option: no current option % on job %',
      p_option_key, p_job_id;
  END IF;

  -- Clear before setting so the one-primary-per-job index never sees two.
  UPDATE job_estimates SET is_primary = false
   WHERE job_id = p_job_id AND is_primary AND id <> v_target.id;

  UPDATE job_estimates
     SET is_primary  = true,
         selected_at = CASE WHEN p_selected THEN COALESCE(selected_at, NOW()) ELSE selected_at END
   WHERE id = v_target.id;

  PERFORM mirror_estimate_to_job(p_job_id, v_target.id);

  RETURN QUERY SELECT v_target.id, v_target.option_key, v_target.estimated_cost;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: every job that already has an estimate gets a v1 'Standard' option
-- that is both current and primary.
--
-- This is what makes the rest of the feature simple: NO job is ever a special
-- case, so no code path needs a "job with no options" branch, and the public
-- estimate page for a single-option job renders exactly as it does today.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO job_estimates (
  job_id, option_key, label, sort_order, version, is_current, is_primary,
  line_items, scopes, scope_notes, estimated_cost, estimated_days,
  margin_percent, customer_provides, warranty_text, payment_terms_text,
  payment_methods, change_note, created_at, updated_at
)
SELECT
  j.id, 'a', 'Standard', 0, 1, true, true,
  j.line_items, j.scopes, j.scope_notes, j.estimated_cost, j.estimated_days,
  j.margin_percent, j.customer_provides, j.warranty_text, j.payment_terms_text,
  j.payment_methods,
  'Backfilled from the existing job record (migration 048)',
  COALESCE(j.updated_at, j.created_at, NOW()),
  COALESCE(j.updated_at, j.created_at, NOW())
FROM jobs j
WHERE jsonb_array_length(COALESCE(j.line_items, '[]'::jsonb)) > 0
  AND NOT EXISTS (SELECT 1 FROM job_estimates e WHERE e.job_id = j.id);

COMMENT ON TABLE job_estimates IS
  'Append-only quote options + version history. Rows sharing (job_id, option_key) '
  'are successive versions of one customer-facing option. jobs.* mirrors the '
  'single is_primary row; accepting a different option copies its payload onto '
  'the job so Stripe/invoicing/work-orders need no changes.';
