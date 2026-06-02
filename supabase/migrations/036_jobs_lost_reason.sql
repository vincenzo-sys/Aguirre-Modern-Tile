-- Migration 036: lost_reason on jobs
-- Run this in Supabase SQL Editor.
--
-- quote_requests already carries lost_reason (migration 011) for win/loss
-- tracking on raw inquiries. Once a lead is quoted it becomes a job, so the
-- same "why did we lose it" reason needs a home on the jobs table too. The
-- leads page's new "Mark as lost" action writes here (status -> 'cancelled'
-- plus the reason), so a lost deal stays distinguishable from a plain cancel
-- and the reason survives for reporting.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS lost_reason TEXT;
