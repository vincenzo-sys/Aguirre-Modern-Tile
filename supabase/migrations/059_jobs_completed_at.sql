-- Migration 059: jobs.completed_at — a completion date that survives an edit.
--
-- THE PROBLEM, MEASURED AGAINST THE LIVE DATABASE ON 2026-08-28
--   There is no completed_at column, so src/lib/googleReview.ts
--   (completionAnchorField) answers "when did this job finish?" by falling
--   through three columns that were never meant to answer it:
--
--       final_payment_at  ->  scheduled_end  ->  updated_at
--
--   Across the 35 jobs at status completed/paid:
--       final_payment_at present ..............  2 / 35   (6%)
--       scheduled_end   present (no fin.pay) .. 18 / 35  (51%)
--       NEITHER -> falls through to updated_at  15 / 35  (43%)
--
--   updated_at is not a completion date. It is the last time ANY column on the
--   row moved. The histogram of updated_at across those 35 finished jobs:
--
--       2026-07-29 .. 12 jobs      2026-08-11 ..  4 jobs
--       2026-04-23 ..  6 jobs      2026-08-25 ..  3 jobs
--       2026-07-17 ..  6 jobs      (4 singletons)
--
--   Twelve jobs finished on the same day to the second. They did not. That is
--   one bulk edit on 2026-07-29, and it silently re-dated every job it touched.
--   Ten of those twelve were saved only because they happen to carry a
--   scheduled_end that outranks updated_at in the fallback chain. The two that
--   were not:
--
--       #53 Jennifer Apell  finished 2026-04-11 -> reads as 2026-07-29 (+109d)
--       #54 Paul De Lima    finished 2026-03-12 -> reads as 2026-07-29 (+139d)
--
-- WHAT IT BREAKS
--   1. RESEAL WIN-BACK (src/lib/reseal.ts). The reseal ladder is completion +
--      12/24/36 months. Every day updated_at drifts forward is a day the
--      12-month anniversary drifts with it. The four jobs whose anniversary is
--      wrong today are late by 64, 79, 109 and 139 days — 391 customer-days of
--      delay on $10,050 of finished work, and it gets worse with every edit.
--      Nothing has fired yet (the oldest job finished 2025-11-06, so the first
--      real anniversary is 2026-11-06) which is exactly why this is cheap to
--      fix NOW and expensive to fix in November.
--
--   2. REVIEW REQUESTS (src/lib/googleReview.ts). DEFAULT_SELECT_OPTIONS sets
--      requireFirmAnchor: true, and updated_at is not a firm anchor — so all 15
--      of those jobs skip as 'soft-completion-date' and are never asked for a
--      Google review at all. Google Maps is the primary lead channel; 15
--      unasked finished jobs is the whole feature failing quietly.
--      Turning requireFirmAnchor off is NOT the fix: it would date the ask off
--      a bulk edit and text "hope you're loving the new tile" to whoever the
--      edit happened to touch.
--
-- THE SOURCES, RANKED (this is the backfill ladder below)
--   1. final_payment_at ......... 2 jobs. On a tile job the final check is
--      handed over on the last day, so this is the most precise signal we hold.
--   2. scheduled_end ............ 18 jobs. The planned last workday. A date
--      ABOUT THE WORK, and it does not move when the row is edited.
--   3. message_log 'status_completed' .. 9 further jobs. The real status-change
--      history: PATCH /api/jobs/[id] writes one of these rows every time a job
--      flips to completed. It is an event log, and it is the best evidence for
--      jobs that were never scheduled in the dashboard.
--      It ranks BELOW scheduled_end on purpose — it records when the DASHBOARD
--      was updated, not when the crew left, and it demonstrably lags:
--          #5  Matt Metelitsa   worked to 2026-06-19, flipped 2026-07-17 (+28d)
--          #68 Roger Babin      worked to 2026-06-11, flipped 2026-07-17 (+36d)
--          #74 David McGee      paid    2026-07-15, flipped 2026-08-25 (+41d)
--      It is also INCOMPLETE by construction: the insert sits inside a block
--      gated on process.env.OPENPHONE_API_KEY and on the job having a phone
--      number, so imports, bulk edits and phone-less jobs write nothing. 13
--      rows for 35 finished jobs. Useful, not authoritative — hence the rank.
--   4. scheduled_start + estimated_days .. 4 further jobs. Derived last workday
--      for jobs that were scheduled but never given an end date.
--   5. NOTHING. 2 jobs (#32 Wayne GC, #73 Jack Holmes) have no date signal of
--      any kind. They stay NULL — deliberately. A NULL falls through to the
--      existing chain and still reads as a weak anchor, which is honest. A
--      guess written into a column named completed_at is not.
--
--   Invoices were evaluated and rejected as a source: the table holds 3 rows
--   total (two $1.00 tests on one job, plus Wayne's $2,500), so it covers
--   nothing. calendar_events holds 6 rows and 4 of them have job_id NULL. Both
--   are noted in the deliverable as manual-correction hints, not as SQL.
--
-- COVERAGE AFTER THIS MIGRATION
--   completed_at populated on 33 / 35 finished jobs (94%), every one of them a
--   firm anchor. Weak-anchor jobs drop from 15 to 2.
--
-- Idempotent — safe to re-run. The backfill only ever fills NULLs.

-- ============================================================
-- 1. Columns
-- ============================================================

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  -- Where the date came from. Not decoration: 'scheduled_derived' and
  -- 'status_log' are inferred, and the Discord digests + any future audit need
  -- to be able to say so rather than presenting an inference as a fact.
  ADD COLUMN IF NOT EXISTS completed_at_source TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_completed_at_source_check'
  ) THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_completed_at_source_check
      CHECK (completed_at_source IS NULL OR completed_at_source IN (
        'status_change',      -- stamped live by the trigger below
        'final_payment',      -- backfilled from final_payment_at
        'scheduled_end',      -- backfilled from scheduled_end
        'status_log',         -- backfilled from message_log status_completed
        'scheduled_derived',  -- backfilled from scheduled_start + estimated_days
        'manual'              -- a human corrected it
      ));
  END IF;
END $$;

-- The reseal cron scans every finished job and sorts by anniversary; the review
-- cron windows on age. Partial index because NULL completed_at is exactly the
-- set neither cron can use.
CREATE INDEX IF NOT EXISTS idx_jobs_completed_at
  ON jobs(completed_at)
  WHERE completed_at IS NOT NULL;

COMMENT ON COLUMN jobs.completed_at IS
  'When the work actually finished. The completion anchor for the review-request '
  'and reseal crons. NEVER derive this from updated_at — any row edit moves that.';

-- ============================================================
-- 2. Keep it true going forward — a trigger, not an app-layer hook
-- ============================================================
--
-- PATCH /api/jobs/[id] already has a completion hook and it is not enough: it
-- fired 6 times against 28 finished jobs, because jobs get imported, bulk
-- edited, or created already-finished, and every one of those paths skips the
-- route. (Same lesson migration 053 wrote its rollup trigger for, and the same
-- lesson the review-requests cron header records.) A BEFORE trigger cannot be
-- bypassed by a writer that forgot, so no application change is needed to keep
-- this column correct.
--
-- 'completed' and 'paid' are ONE state here — finished. Moving between them is
-- a money event, not a second completion, and must not re-stamp the date.

CREATE OR REPLACE FUNCTION jobs_stamp_completed_at()
RETURNS TRIGGER AS $$
DECLARE
  finished CONSTANT TEXT[] := ARRAY['completed', 'paid'];
  was_finished BOOLEAN := FALSE;
  is_finished  BOOLEAN;
BEGIN
  -- ::text — status is the job_status enum; enum = ANY(text[]) has no operator
  -- in real Postgres (PGlite tolerated it, which is why the test passed).
  is_finished := NEW.status::text = ANY(finished);

  IF TG_OP = 'UPDATE' THEN
    was_finished := OLD.status::text = ANY(finished);

    -- An explicit write to completed_at always wins — the backfill below, and
    -- a human fixing a date the crew disputes. Without this the trigger would
    -- fight every correction it was written to make possible.
    IF NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
      IF NEW.completed_at IS NOT NULL
         AND NEW.completed_at_source IS NOT DISTINCT FROM OLD.completed_at_source THEN
        NEW.completed_at_source := 'manual';
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  IF is_finished AND NOT was_finished AND NEW.completed_at IS NULL THEN
    NEW.completed_at := NOW();
    NEW.completed_at_source := 'status_change';
  ELSIF was_finished AND NOT is_finished THEN
    -- Reopened. Clearing is the point: job #85 was mis-flipped to completed on
    -- 2026-08-11, and a stale completion date left behind on the way back out
    -- would keep it eligible for a review ask about work that is not done.
    NEW.completed_at := NULL;
    NEW.completed_at_source := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jobs_stamp_completed_at ON jobs;
CREATE TRIGGER jobs_stamp_completed_at
  BEFORE INSERT OR UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION jobs_stamp_completed_at();

-- ============================================================
-- 3. Backfill
-- ============================================================
--
-- Two clamps, both load-bearing:
--   * LEAST(..., flipped_at) — a job cannot have finished AFTER the moment
--     someone marked it finished. Costs nothing on today's data (every flip
--     post-dates its scheduled_end) and bounds the derived cases forever.
--   * LEAST(..., NOW()) — a scheduled_end in the future on an already-paid job
--     must not produce a completion date that has not happened yet.
--   LEAST() ignores NULL arguments in Postgres, so a missing flip is a no-op;
--   the WHERE clause is what guarantees we never write a bare NOW().
--
-- Dates are pinned to UTC midnight rather than session-local, matching how
-- daysBetween() in googleReview.ts already reads a bare YYYY-MM-DD. Without
-- that the same date ages one day differently depending on server timezone.

WITH status_flip AS (
  -- MIN, not MAX: if a job was flipped, reopened and re-flipped, the FIRST
  -- completion is the one the maintenance clock should count from.
  SELECT job_id, MIN(created_at) AS flipped_at
  FROM message_log
  WHERE trigger_type = 'status_completed'
    AND job_id IS NOT NULL
  GROUP BY job_id
),
candidate AS (
  SELECT
    j.id,
    sf.flipped_at,
    CASE
      WHEN j.final_payment_at IS NOT NULL THEN j.final_payment_at
      WHEN j.scheduled_end    IS NOT NULL THEN (j.scheduled_end::TIMESTAMP AT TIME ZONE 'UTC')
      WHEN sf.flipped_at      IS NOT NULL THEN sf.flipped_at
      WHEN j.scheduled_start  IS NOT NULL THEN
        ((j.scheduled_start + (GREATEST(COALESCE(j.estimated_days, 1)::INT, 1) - 1))::TIMESTAMP
          AT TIME ZONE 'UTC')
    END AS raw_at,
    CASE
      WHEN j.final_payment_at IS NOT NULL THEN 'final_payment'
      WHEN j.scheduled_end    IS NOT NULL THEN 'scheduled_end'
      WHEN sf.flipped_at      IS NOT NULL THEN 'status_log'
      WHEN j.scheduled_start  IS NOT NULL THEN 'scheduled_derived'
    END AS src
  FROM jobs j
  LEFT JOIN status_flip sf ON sf.job_id = j.id
  WHERE j.status IN ('completed', 'paid')
    AND j.completed_at IS NULL
)
UPDATE jobs j
SET completed_at        = LEAST(c.raw_at, c.flipped_at, NOW()),
    completed_at_source = c.src
FROM candidate c
WHERE j.id = c.id
  AND c.raw_at IS NOT NULL;

-- ============================================================
-- 4. Verify (run these after; expected values as of 2026-08-28)
-- ============================================================
--
-- Coverage — expect 35 finished, 33 dated, 2 null:
--
--   SELECT COUNT(*) AS finished,
--          COUNT(completed_at) AS dated,
--          COUNT(*) - COUNT(completed_at) AS still_null
--   FROM jobs WHERE status IN ('completed','paid');
--
-- Source mix — expect scheduled_end 18, status_log 9, scheduled_derived 4,
-- final_payment 2:
--
--   SELECT completed_at_source, COUNT(*)
--   FROM jobs WHERE status IN ('completed','paid')
--   GROUP BY 1 ORDER BY 2 DESC;
--
-- The two that could not be dated — expect #32 Wayne GC, #73 Jack Holmes:
--
--   SELECT job_number, client_name, updated_at
--   FROM jobs WHERE status IN ('completed','paid') AND completed_at IS NULL
--   ORDER BY job_number;
--
-- Nothing in the future, nothing absurdly old:
--
--   SELECT COUNT(*) FROM jobs
--   WHERE completed_at > NOW() OR completed_at < '2024-01-01';   -- expect 0
--
-- The four jobs this migration actually re-dates (reseal anniversary moves
-- EARLIER by 64-139 days) — expect #40, #53, #54, #56:
--
--   SELECT job_number, client_name, (completed_at AT TIME ZONE 'UTC')::date AS now_reads,
--          updated_at::date AS used_to_read, completed_at_source
--   FROM jobs
--   WHERE status IN ('completed','paid')
--     AND completed_at_source = 'scheduled_derived'
--   ORDER BY job_number;
