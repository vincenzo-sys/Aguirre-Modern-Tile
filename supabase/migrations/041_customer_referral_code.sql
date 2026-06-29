-- Migration 041: per-customer referral code
--
-- Migration 019 added referral ATTRIBUTION (referred_by_customer_id +
-- referral_reward_paid) but there was no customer-facing way to actually refer
-- anyone. This adds a short, URL-friendly referral_code so each customer gets a
-- shareable link (/refer/<code>). When a friend submits a quote through that
-- link, the new customer's referred_by_customer_id is set to the referrer.
--
-- The column DEFAULTs to a generated 10-char code (gen_random_uuid is volatile,
-- so every row gets a distinct value) — so existing rows backfill and every new
-- customer created by any code path gets a code with zero app changes.
--
-- Idempotent — safe to re-run.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS referral_code TEXT
    DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);

-- Backfill any rows that predate the default.
UPDATE customers
SET referral_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
WHERE referral_code IS NULL;

-- One code → one customer; also makes /refer/<code> lookups fast.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_referral_code
  ON customers (referral_code)
  WHERE referral_code IS NOT NULL;
