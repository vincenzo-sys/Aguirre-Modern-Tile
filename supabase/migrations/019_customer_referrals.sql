-- Migration 019: Customer referrals
-- Run this in Supabase SQL Editor.
--
-- Purpose: formalize "who referred this customer" so we can answer
--   "who are my top referrers?" and "did we pay the referral reward?"
--   Previously customers.source was a free-text field that collapsed
--   "Referral" into a single opaque bucket with no attribution.
--
-- Shape:
--   - referred_by_customer_id: self-FK, nullable. If set, this customer
--     came in via that customer's word-of-mouth / direct pass.
--   - referral_reward_paid: boolean, tracks whether we've comped/paid
--     the referrer (e.g. discount on their next job, cash, gift card).
--
-- ON DELETE SET NULL: if a referrer is ever deleted, we don't lose
--   the referred customer — we just lose the attribution.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS referred_by_customer_id UUID
    REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_reward_paid BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_customers_referred_by
  ON customers(referred_by_customer_id)
  WHERE referred_by_customer_id IS NOT NULL;
