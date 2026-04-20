-- Migration 015: Shareable estimate tokens on jobs
-- Run this in Supabase SQL Editor.
--
-- Purpose: generate a public URL per job so the customer can view the
-- estimate online and pay the 10% deposit via Stripe Checkout. Replaces
-- PDF workflow.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS estimate_token TEXT,
  ADD COLUMN IF NOT EXISTS estimate_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS estimate_viewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS estimate_accepted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_estimate_token
  ON jobs(estimate_token)
  WHERE estimate_token IS NOT NULL;
