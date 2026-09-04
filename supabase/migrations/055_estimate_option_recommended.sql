-- 055 — let Vin pick which tier carries the "Recommended" badge.
--
-- OPTIONAL. The tier ladder works without this migration: with 3+ options the
-- badge is derived as the median by price (see src/lib/estimateTiers.ts), and
-- src/app/api/public/estimates/[token]/route.ts selects this column
-- defensively — if it isn't here, the query falls back and the page renders
-- exactly as it does today. Applying this only adds a manual override.
--
-- WHY A NEW COLUMN INSTEAD OF REUSING is_primary
--   is_primary is plumbing: exactly one row per job is mirrored onto jobs.* so
--   Stripe, the completion invoice and the crew work order always have a number
--   to read. POST /api/jobs/[id]/estimate-options sets is_primary = false on
--   every option it creates, on purpose — adding "Signature" must not silently
--   re-price the job. The consequence is that is_primary is always the FIRST
--   option priced, which on a tier ladder is the cheapest one. Driving a
--   customer-facing recommendation off it would recommend the cheapest tier on
--   every quote that goes out.
--
-- The recommendation is a SALES fact; is_primary is an ACCOUNTING fact. They
-- happen to be booleans on the same table and are otherwise unrelated.

ALTER TABLE job_estimates
  ADD COLUMN IF NOT EXISTS recommended BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN job_estimates.recommended IS
  'Customer-facing "Recommended" badge on the estimate page. Independent of is_primary (which is the row mirrored onto jobs.*). NULL/false everywhere means the badge is derived from the price ladder instead.';

-- At most one recommended option per job. Partial unique index rather than a
-- CHECK because the constraint is across rows, and it must only consider the
-- LIVE options — historical versions of a once-recommended option keep their
-- flag and would otherwise collide.
CREATE UNIQUE INDEX IF NOT EXISTS job_estimates_one_recommended
  ON job_estimates (job_id)
  WHERE recommended AND is_current;
