-- Migration 045: deposit_paid column, deposit-session idempotency, atomic
-- payment-increment RPCs.
--
-- Context: jobs.amount_paid is a rolling total across THREE payment channels —
-- paid Stripe invoices, the manual final payment (final_payment_amount), and
-- the Stripe-Checkout deposit — but only final_payment_amount had a column.
-- The invoice-recompute paths (webhook / PATCH / sync) that set
--   amount_paid = SUM(paid invoices)
-- therefore WIPED the deposit + final payment whenever a job mixed channels.
-- src/lib/jobPayments.ts (recomputeJobFinancials) already folds in
-- final_payment_amount; this migration adds the missing deposit column so it
-- can fold that in too, and fixes:
--   #12  deposit-checkout idempotency — dedup on the Stripe SESSION id (not
--        estimate_accepted_at) so a redelivery is a no-op AND a 2nd genuine
--        deposit still credits instead of being silently swallowed.
--   #17  non-atomic amount_paid read-modify-write in the final-payment route.
--
-- Run: node scripts/run-migration.mjs supabase/migrations/045_payment_channels.sql
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE) — safe to re-run.
-- Additive only — no existing column/behaviour is altered, so it is safe to
-- apply ahead of the code deploy.

-- 1. The deposit channel gets its own column, mirroring final_payment_amount.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS deposit_paid NUMERIC(10, 2) NOT NULL DEFAULT 0;

-- 2. Ledger of Stripe Checkout deposit sessions we've already credited. The
--    primary key makes crediting idempotent on the Stripe object itself: a
--    redelivered session conflicts (skip), a brand-new session inserts
--    (credit). This replaces the estimate_accepted_at dedup that swallowed a
--    legitimate second deposit. #12
CREATE TABLE IF NOT EXISTS processed_deposit_sessions (
  session_id TEXT PRIMARY KEY,
  job_id     UUID REFERENCES jobs(id) ON DELETE CASCADE,
  amount     NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Atomic per-channel increments so concurrent writers (Stripe webhook
--    redelivery, a manual final payment, a second deposit) can't lose an update
--    through a read-modify-write race. #17
CREATE OR REPLACE FUNCTION increment_job_deposit(p_job_id UUID, p_delta NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE v NUMERIC;
BEGIN
  UPDATE jobs
     SET deposit_paid = ROUND(COALESCE(deposit_paid, 0) + p_delta, 2)
   WHERE id = p_job_id
  RETURNING deposit_paid INTO v;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION increment_job_final_payment(p_job_id UUID, p_delta NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE v NUMERIC;
BEGIN
  UPDATE jobs
     SET final_payment_amount = ROUND(COALESCE(final_payment_amount, 0) + p_delta, 2)
   WHERE id = p_job_id
  RETURNING final_payment_amount INTO v;
  RETURN v;
END;
$$;

-- 4. Backfill deposit_paid by RECONSTRUCTION, not by assuming the deposit was
--    10% of estimated_cost (manual deposits via DepositReceivedAction can be
--    any amount). deposit_paid = whatever in amount_paid is NOT explained by
--    the final payment or paid invoices, so once recompute runs
--    (amount_paid = paid-invoices + final_payment_amount + deposit_paid) the
--    historical amount_paid is preserved EXACTLY for every job. Clamped at 0.
UPDATE jobs j
   SET deposit_paid = GREATEST(
     ROUND(
       COALESCE(j.amount_paid, 0)
       - COALESCE(j.final_payment_amount, 0)
       - COALESCE((SELECT SUM(i.amount) FROM invoices i
                    WHERE i.job_id = j.id AND i.status = 'paid'), 0),
       2
     ), 0)
 WHERE COALESCE(j.amount_paid, 0) > 0
   AND j.deposit_paid = 0;
