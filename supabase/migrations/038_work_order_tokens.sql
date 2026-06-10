-- Migration 038: crew-facing work order share links
--
-- A SEPARATE token from estimate_token on purpose. The estimate link
-- (/estimates/[estimate_token]) exposes pricing, margin, and deposit. The
-- work order link (/work-orders/[work_order_token]) is for the install crew
-- and shows ONLY: customer contact, address, scope, and materials — no money.
-- Independent tokens mean a crew member can never path-swap their link into
-- the customer estimate to see financials.
--
-- Idempotent — safe to re-run.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS work_order_token TEXT,
  ADD COLUMN IF NOT EXISTS work_order_shared_at TIMESTAMPTZ;

-- Token is the access secret; a unique index keeps lookups fast and prevents
-- a (vanishingly unlikely) collision from pointing one link at two jobs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_work_order_token
  ON jobs (work_order_token)
  WHERE work_order_token IS NOT NULL;
