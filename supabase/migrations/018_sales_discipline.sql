-- Migration 018: Sales-discipline columns + expanded job statuses
-- Run this in Supabase SQL Editor.
--
-- Purpose: bring the Notion-era sales workflow into Supabase so we can
--   cron-drive follow-ups, track priority, and represent real-world states
--   the business has but the enum previously didn't ("deposit paid, not yet
--   scheduled" and "estimate revised after first send").
--
-- Notes:
--   - Migration 011 already added source/last_contact_at/next_follow_up/
--     lost_reason/notes to quote_requests. We ADD follow_up_count + priority
--     to both quote_requests and jobs, and mirror last/next contact on jobs.
--   - Status values are added to the existing enum (job_status). We pick
--     positions that read naturally in the lifecycle.
--   - Backfill runs at the end: any job with amount_paid > 0 and no
--     scheduled_start becomes 'accepted_not_scheduled'; any job PATCHed
--     after estimate_sent_at gets flagged 'estimate_revised' only if it's
--     still in pre-scheduled territory (lead/quoted).

BEGIN;

-- 1. Add status values (enum additions must each be their own ALTER TYPE
--    in Postgres; IF NOT EXISTS keeps this idempotent for re-runs)
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'accepted_not_scheduled' AFTER 'quoted';
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'estimate_revised' AFTER 'quoted';

COMMIT;

-- Enum additions must be committed before they can be used in UPDATE,
-- so the rest of the migration runs in a second transaction.
BEGIN;

-- 2. Sales-discipline columns on jobs
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS priority TEXT
    CHECK (priority IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS follow_up_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_contact_date DATE;

CREATE INDEX IF NOT EXISTS idx_jobs_next_contact_date
  ON jobs(next_contact_date)
  WHERE next_contact_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_priority
  ON jobs(priority)
  WHERE priority IS NOT NULL;

-- 3. Round out the CRM shape on quote_requests too (already has source,
--    last_contact_at, next_follow_up from migration 011)
ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS priority TEXT
    CHECK (priority IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS follow_up_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_quote_requests_priority
  ON quote_requests(priority)
  WHERE priority IS NOT NULL;

-- 4. Backfill: mark deposit-paid-but-unscheduled jobs with the new status.
--    Only touches rows where the status mismatch is obvious.
UPDATE jobs
SET status = 'accepted_not_scheduled'
WHERE amount_paid > 0
  AND scheduled_start IS NULL
  AND status IN ('lead', 'quoted');

COMMIT;
