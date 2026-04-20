-- Migration 012: In-person estimate visits and field instructions
-- Run this in Supabase SQL Editor.
--
-- Purpose:
--   1. Schedule in-person estimate visits on leads before converting to jobs.
--   2. Give jobs a dedicated "crew_instructions" field separate from the
--      owner's internal notes — so Christian in the field has a clean place
--      to read gate codes, parking, scope-of-day, etc.

-- Leads can have a scheduled site visit
ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS site_visit_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS site_visit_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_quote_requests_site_visit_at
  ON quote_requests(site_visit_at)
  WHERE site_visit_at IS NOT NULL;

-- Jobs get a crew-facing instructions field, separate from internal notes
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS crew_instructions TEXT;
