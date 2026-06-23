-- Migration 040: customer-facing invoice share links
--
-- Mirrors the estimate_token / work_order_token pattern (migrations 015, 038).
-- Each invoice gets a public_token so a customer can open a branded, read-only
-- invoice at /invoices/[public_token] — view it, print it to PDF, and pay it —
-- without logging in. The page exposes ONLY customer-safe fields; cost/margin
-- never leave the dashboard.
--
-- stripe_hosted_url caches the Stripe-hosted payment URL returned at send/
-- finalize time so the public "Pay now" button can deep-link straight to
-- Stripe's secure pay page without a live API round-trip on each view.
--
-- Idempotent — safe to re-run.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS public_token TEXT,
  ADD COLUMN IF NOT EXISTS stripe_hosted_url TEXT,
  ADD COLUMN IF NOT EXISTS public_link_sent_at TIMESTAMPTZ;

-- Unique index keeps token lookups fast and prevents a (vanishingly unlikely)
-- collision from pointing one link at two invoices.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_public_token
  ON invoices (public_token)
  WHERE public_token IS NOT NULL;

-- Backfill tokens for existing invoices. gen_random_uuid() (pgcrypto, enabled
-- by default on Supabase) gives a collision-free secret; replace() strips the
-- hyphens so the URL slug matches the base64url-ish shape used elsewhere.
UPDATE invoices
SET public_token = replace(gen_random_uuid()::text, '-', '') ||
                   replace(gen_random_uuid()::text, '-', '')
WHERE public_token IS NULL;
