-- Migration 011: Add CRM fields to quote_requests
-- Run this in Supabase SQL Editor.
--
-- Purpose: turn the leads table into a proper CRM surface so we can track
-- where a lead came from, when we last touched it, when to follow up, why
-- it was lost, and keep a notes field for sales context.

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'website',
  ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_follow_up DATE,
  ADD COLUMN IF NOT EXISTS lost_reason TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Index to power the "Needs follow-up" tab on the leads page
CREATE INDEX IF NOT EXISTS idx_quote_requests_next_follow_up
  ON quote_requests(next_follow_up)
  WHERE next_follow_up IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quote_requests_source ON quote_requests(source);

-- Backfill existing rows: everything pre-existing came from the website form
UPDATE quote_requests SET source = 'website' WHERE source IS NULL;
