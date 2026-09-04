-- Migration 054: mark GCs, and give the deposit gate somewhere to record itself.
--
-- WHY
--   There is no way to ask this database "is this a GC job?". customers has
--   name/email/phone/source and nothing else; `source` is
--   website|manual|referral|repeat, none of which mean "general contractor".
--   Every GC identification in the codebase today is a human reading the string
--   "Aaron (GC)". A deposit policy that applies only to GC work needs a real
--   flag, not a LIKE on a display name.
--
-- MEASURED AGAINST THE LIVE DATABASE ON 2026-08-23
--   4 GC customers, 9 jobs, $45,172.54 of work:
--     Aaron (GC)                6 jobs   $26,565.64   deposits recorded: $0.00
--     Jerome — 1Big Construction 1 job   $10,639.90   deposits recorded: $0.00
--     Christian (NJZ)            1 job    $5,217.00   deposits recorded: $0.00
--     Wayne GC                   1 job    $2,750.00   deposits recorded: $0.00
--   Not one GC job has ever had a deposit recorded against it, and Wayne's is
--   now a $2,500 open receivable past its lien window.
--
-- Additive and idempotent. Applies cleanly whether or not 053 has run.
-- Run: node scripts/run-migration.mjs supabase/migrations/054_gc_deposit_gate.sql

-- ============================================================
-- 1. The GC flag
-- ============================================================
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS is_gc BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN customers.is_gc IS
  'True for general contractors / trade partners. Drives the higher deposit percentage and the scheduling gate in src/lib/depositGate.ts. Set it on the customer, not the job — a GC''s next job is still a GC job.';

CREATE INDEX IF NOT EXISTS idx_customers_is_gc ON customers (is_gc) WHERE is_gc;

-- Backfill the GC customers that exist today. Anchored to the full display
-- names actually present (5 rows: Christian (NJZ) exists twice, 480ad9b8 and
-- 49c7b197, and both should be flagged) rather than a loose '%gc%' substring
-- that would also catch a homeowner whose surname contains those letters.
--
-- 'Jerome%1Big%' is a LIKE rather than an equality test on purpose: that row's
-- display name contains an em dash, and an exact match is one encoding round
-- trip away from silently matching nothing.
UPDATE customers
   SET is_gc = TRUE
 WHERE is_gc = FALSE
   AND (
     name IN ('Aaron (GC)', 'Wayne GC', 'Christian (NJZ)')
     OR name LIKE 'Jerome%1Big%'
   );

-- ============================================================
-- 2. Override audit trail on the job
-- ============================================================
-- The gate can be overridden (a GC Vin genuinely trusts, an emergency slot).
-- An override that leaves no trace is just a disabled gate, so it is recorded
-- here as well as in crew_log.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS deposit_gate_override_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deposit_gate_override_reason     TEXT,
  ADD COLUMN IF NOT EXISTS deposit_gate_override_by_profile_id UUID
    REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN jobs.deposit_gate_override_reason IS
  'Why this job was allowed onto the calendar without its deposit. Required by POST/PATCH when override_deposit_gate is used — an override with no reason is rejected.';

-- ============================================================
-- 3. The policy, once
-- ============================================================
-- The same CASE was written twice inside the view below (select list and WHERE
-- clause) and a third time in requiredDeposit() in src/lib/depositGate.ts.
-- Three transcriptions of a money rule is three chances to reprice two of them.
-- This is the SQL side's single copy; depositGate.ts is the TypeScript one, and
-- the two are expected to agree.
--
-- The rates live here as literals rather than a settings row on purpose: a
-- deposit policy that can be edited without a migration is a policy nobody can
-- reconstruct after the fact.
--
-- NOTE the GREATEST/LEAST NULL semantics, which are load-bearing and preserved
-- verbatim from the original expression: Postgres ignores NULLs in GREATEST and
-- LEAST, so a GC job with a NULL estimated_cost yields 500 rather than NULL,
-- while a retail one yields NULL. The view's WHERE filters those rows out
-- anyway; the behaviour is kept identical so this refactor cannot move a number.
CREATE OR REPLACE FUNCTION public.required_deposit(p_cost NUMERIC, p_is_gc BOOLEAN)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ROUND(
    CASE WHEN p_is_gc
         THEN GREATEST(p_cost * 0.25, LEAST(500, p_cost))
         ELSE p_cost * 0.10
    END, 2)
$$;

COMMENT ON FUNCTION public.required_deposit(NUMERIC, BOOLEAN) IS
  'Policy deposit for a job: 25% with a $500 floor for GCs, 10% for homeowners, never more than the job is worth. Mirrors requiredDeposit() in src/lib/depositGate.ts — change both together.';

GRANT EXECUTE ON FUNCTION public.required_deposit(NUMERIC, BOOLEAN) TO authenticated, service_role;

-- ============================================================
-- 4. The standing report
-- ============================================================
-- What Vin actually wants to look at: committed work with money still to
-- collect. Deliberately a VIEW rather than a cron, because the number is only
-- trustworthy once the Stripe deposit webhook is recording again — see the
-- header of src/lib/depositGate.ts.
CREATE OR REPLACE VIEW jobs_missing_deposit AS
SELECT j.id,
       j.job_number,
       j.title,
       j.client_name,
       j.status,
       j.scheduled_start,
       j.estimated_cost,
       COALESCE(j.deposit_paid, 0)          AS deposit_recorded,
       COALESCE(c.is_gc, FALSE)             AS is_gc,
       public.required_deposit(j.estimated_cost, COALESCE(c.is_gc, FALSE))
                                            AS deposit_required,
       j.deposit_gate_override_at,
       j.deposit_gate_override_reason
  FROM jobs j
  LEFT JOIN customers c ON c.id = j.customer_id
 WHERE j.status IN ('accepted_not_scheduled','scheduled','in_progress','waiting_for_materials')
   AND COALESCE(j.estimated_cost, 0) > 0
   AND COALESCE(j.deposit_paid, 0)
         < public.required_deposit(j.estimated_cost, COALESCE(c.is_gc, FALSE)) - 1;

COMMENT ON VIEW jobs_missing_deposit IS
  'Committed jobs whose recorded deposit is short of policy. WARNING: deposit_paid is fed by the Stripe deposit webhook, which has recorded 0 of 21 paid Checkout sessions. Reconcile Stripe before treating a row here as uncollected money.';

-- ============================================================
-- Verification (run by hand after applying)
-- ============================================================
--   SELECT name, is_gc FROM customers WHERE is_gc ORDER BY name;      -- expect 4-5 rows
--   SELECT COUNT(*) FROM jobs_missing_deposit;                        -- expect 6 on 2026-08-23
--   SELECT job_number, client_name, deposit_required, deposit_recorded
--     FROM jobs_missing_deposit ORDER BY deposit_required DESC;
