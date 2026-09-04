-- Migration 060: message_log.error — persist WHY an SMS failed.
-- Run in Supabase SQL Editor (idempotent, safe to re-run).
--
-- Today message_log records THAT a send failed (status = 'failed') and nothing
-- else. As of 2026-08-29 the table holds 520 outbound rows and every one of
-- them is 'failed' — 498 estimate_viewed_nudge, 13 status_completed,
-- 8 status_scheduled, 1 missed_call, across 53 phone numbers and 41 jobs,
-- stretching back to 2026-04-04. Not one of them says why.
--
-- The reason existed: sendSMS() already parses the OpenPhone response body into
-- `{ success: false, error: "OpenPhone 403: ..." }`. Every caller then dropped
-- it into console.error and a Discord embed — both ephemeral. Five months of a
-- dead SMS channel with no forensic trail in the database.
--
-- After this migration + the matching code change, the next cron run writes the
-- provider's own rejection into the row, and this is the whole diagnosis:
--
--   SELECT error, count(*), max(created_at)
--     FROM message_log
--    WHERE status = 'failed' AND error IS NOT NULL
--    GROUP BY 1 ORDER BY 2 DESC;
--
-- NULL semantics: a 'failed' row with error IS NULL is a PRE-migration attempt
-- (or a row written by code that predates the change). It is NOT "failed for no
-- reason". The 520 historical rows are deliberately left NULL — we do not know
-- what OpenPhone said in April and inventing a reason would poison the query
-- above. They are dated, so they self-identify.

ALTER TABLE message_log ADD COLUMN IF NOT EXISTS error TEXT;

COMMENT ON COLUMN message_log.error IS
  'Provider/send failure reason for status=''failed'' rows (bounded to 500 chars by the app). NULL on success, and NULL on failed rows attempted before migration 060 (2026-08-29) when the reason was not captured.';

-- "What is breaking, and since when" — the triage query is failures newest
-- first, so index exactly that and skip the 476 inbound rows entirely.
CREATE INDEX IF NOT EXISTS message_log_failed_idx
  ON message_log (created_at DESC) WHERE status = 'failed';
