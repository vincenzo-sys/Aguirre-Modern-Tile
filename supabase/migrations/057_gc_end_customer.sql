-- Migration 057: capture the END CUSTOMER on GC jobs, so the Google review ask
-- reaches the person who actually has a reason to leave one.
--
-- WHY
--   goals.md names the Google Maps local pack as the primary lead source for
--   this business and the review count as the moat. The review-request cron
--   (src/app/api/cron/review-requests/route.ts) texts jobs.client_phone.
--
--   On a GC job, client_phone IS THE GC. Wayne, Aaron, Jerome, Christian, Billy
--   — none of them are ever going to write "Aguirre retiled my bathroom and it
--   looks amazing", because it wasn't their bathroom. The homeowner whose
--   bathroom it was is the one who would, and this database has never held her
--   phone number. There is exactly one contact triple on a job
--   (client_name / client_phone / client_email) and the GC occupies it.
--
-- MEASURED AGAINST THE LIVE CRM ON 2026-08-27
--   5 GC customers, 10 jobs, $49,334.72:
--     Aaron (GC)                    6 jobs  $26,565.64
--     Jerome — 1Big Construction    1 job   $10,639.90
--     Christian (NJZ)               1 job    $5,217.00
--     Billy Abildgaard — Lee Const. 1 job    $4,162.18
--     Wayne GC                      1 job    $2,750.00
--   Three of those are finished work — #32 Wayne (Salisbury, $2,750), #36 Aaron
--   (North Shore steam room, $9,100), #42 Christian (Milton, $5,217), $17,067
--   total — and not one of them produced a review, because the only number on
--   the job belonged to the contractor.
--
--   End-customer contact captured across all 10 GC jobs today: ZERO. Not in a
--   column, not in notes, not in crew_instructions. It was never collected.
--
-- WHAT THIS ADDS
--   1. The three end-customer columns, on jobs (denormalized, matching how
--      client_* already lives on jobs rather than only on customers).
--   2. end_customer_review_ok — an explicit consent flag, default FALSE.
--   3. A worklist view so "which GC jobs are missing it" is one query.
--
-- WHY THE CONSENT FLAG, AND WHY IT DEFAULTS FALSE
--   A GC referral relationship is worth more than a review. Aaron alone is
--   $26,565.64 of quoted work across 6 jobs. Texting his client behind his back
--   — even about something as harmless as a review — is exactly the thing that
--   ends a referral pipeline, and Vin would find out about it after the fact.
--   So the bot never contacts an end customer it was not explicitly cleared to
--   contact. FALSE means "not cleared", which means "skip", not "ask the GC
--   instead". The ask is cheap to get: "mind if I ask the homeowner for a
--   Google review when we wrap? I'll credit you in it" is a one-line text at
--   walkthrough, and most GCs say yes because the review names them too.
--
-- Additive and idempotent. Applies cleanly whether or not 054 has run — the
-- customers.is_gc block below is a deliberate verbatim repeat of 054's, because
-- 054 is written but NOT applied in production, and the view here needs the
-- column. Both use IF NOT EXISTS, so whichever runs second is a no-op.
--
-- Run: node scripts/run-migration.mjs supabase/migrations/057_gc_end_customer.sql

-- ============================================================
-- 0. The GC flag (repeat of 054 §1 — see header)
-- ============================================================
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS is_gc BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_customers_is_gc ON customers (is_gc) WHERE is_gc;

-- Anchored to the full display names actually present on 2026-08-27 (5 rows;
-- the second Christian (NJZ) row from notion_import has since been merged away)
-- rather than a loose '%gc%' substring that would also catch a homeowner whose
-- surname contains those letters. 'Jerome%1Big%' and 'Billy%Lee%' are LIKEs
-- because both contain an em dash, and an exact match is one encoding round
-- trip away from silently matching nothing.
UPDATE customers
   SET is_gc = TRUE
 WHERE is_gc = FALSE
   AND (
     name IN ('Aaron (GC)', 'Wayne GC', 'Christian (NJZ)')
     OR name LIKE 'Jerome%1Big%'
     OR name LIKE 'Billy%Lee Construction%'
   );

-- ============================================================
-- 1. End-customer contact on the job
-- ============================================================
-- On the JOB, not the customer, on purpose: a GC brings a different homeowner
-- every job. Aaron's six jobs are six different addresses. Hanging this off
-- customers would overwrite last job's homeowner with this job's.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS end_customer_name       TEXT,
  ADD COLUMN IF NOT EXISTS end_customer_phone      TEXT,
  ADD COLUMN IF NOT EXISTS end_customer_email      TEXT,
  ADD COLUMN IF NOT EXISTS end_customer_review_ok  BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN jobs.end_customer_name IS
  'The homeowner / tenant / building owner whose space this actually is, on jobs where client_* is a general contractor. Named end_customer rather than homeowner because #27 (1599 Columbus Ave) is a commercial tenant fit-out for Justice 4 Housing, not a house.';

COMMENT ON COLUMN jobs.end_customer_phone IS
  'Mobile for the end customer. This is who the Google review ask goes to on a GC job — see selectReviewRequests() in src/lib/googleReview.ts. Never populated from the GC''s own number.';

COMMENT ON COLUMN jobs.end_customer_review_ok IS
  'The GC has cleared us to contact this end customer directly. FALSE (the default) means the review cron SKIPS the job — it does NOT mean "fall back to texting the GC". A GC referral pipeline is worth more than any single review; Aaron alone is $26,565.64 across 6 jobs.';

-- Partial index: the cron and the view both filter on "has a number we may use",
-- and that is a small slice of a table that is mostly retail jobs.
CREATE INDEX IF NOT EXISTS idx_jobs_end_customer_contactable
  ON jobs (id)
  WHERE end_customer_review_ok AND end_customer_phone IS NOT NULL;

-- ============================================================
-- 2. The worklist
-- ============================================================
-- Committed or finished GC work with no usable end-customer contact. This is
-- the list Vin works through — one text to the GC per row — and it is also what
-- the review cron reports into Discord when it skips a GC job.
--
-- 'lead' and 'quoted' are excluded deliberately: asking for the homeowner's
-- number before the job is won is a strange call to make, and it would bury the
-- rows that are actually actionable.
CREATE OR REPLACE VIEW gc_jobs_missing_end_customer AS
SELECT j.id,
       j.job_number,
       j.title,
       j.client_name                      AS gc_name,
       j.client_phone                     AS gc_phone,
       j.status,
       j.client_address,
       j.scheduled_end,
       j.final_payment_at,
       j.estimated_cost,
       j.end_customer_name,
       j.end_customer_phone,
       j.end_customer_review_ok,
       CASE
         WHEN COALESCE(j.end_customer_phone, '') = '' THEN 'no_contact'
         WHEN NOT j.end_customer_review_ok            THEN 'not_cleared'
       END                                AS gap
  FROM jobs j
  LEFT JOIN customers c ON c.id = j.customer_id
 WHERE COALESCE(c.is_gc, FALSE)
   AND j.status IN (
     'accepted_not_scheduled', 'scheduled', 'in_progress',
     'waiting_for_materials', 'completed', 'paid'
   )
   AND (COALESCE(j.end_customer_phone, '') = '' OR NOT j.end_customer_review_ok);

COMMENT ON VIEW gc_jobs_missing_end_customer IS
  'GC jobs that are committed or finished and cannot be asked for a Google review, because the end customer is unknown (gap=no_contact) or not cleared for contact (gap=not_cleared). Expect 3 finished rows on 2026-08-27: #32 Wayne, #36 Aaron, #42 Christian.';

-- ============================================================
-- Verification (run by hand after applying)
-- ============================================================
--   SELECT name, is_gc FROM customers WHERE is_gc ORDER BY name;   -- expect 5
--   SELECT job_number, gc_name, status, gap FROM gc_jobs_missing_end_customer
--    ORDER BY job_number;    -- expect exactly 3 rows on 2026-08-27, all
--     gap='no_contact': #32 Wayne (completed), #36 Aaron (completed),
--     #42 Christian (paid). The other 7 GC jobs are cancelled (#29/#52/#76/#78),
--     still quoting (#27 estimate_revised, #79 awaiting_response) or a raw lead
--     (#103), and none of those are review-askable yet.
--   -- after Vin fills one in, it should drop out of the view:
--   -- UPDATE jobs SET end_customer_name='...', end_customer_phone='...',
--   --        end_customer_review_ok=TRUE WHERE job_number = 36;
