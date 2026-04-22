-- Migration 020: Final payment tracking on jobs
-- Run this in Supabase SQL Editor.
--
-- Purpose: distinguish the final payment (paid on job completion, often
-- cash or check handed to Christian on site) from the deposit
-- (collected earlier via Stripe). jobs.amount_paid is the rolling total;
-- these columns capture when + how the final payment specifically came in,
-- and who recorded it.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS final_payment_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_payment_amount NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS final_payment_method TEXT
    CHECK (final_payment_method IN ('cash', 'check', 'stripe', 'zelle', 'venmo', 'other')),
  ADD COLUMN IF NOT EXISTS final_payment_note TEXT,
  ADD COLUMN IF NOT EXISTS final_payment_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_final_payment_at
  ON jobs(final_payment_at)
  WHERE final_payment_at IS NOT NULL;
