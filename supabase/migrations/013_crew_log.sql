-- Migration 013: Crew log on jobs
-- Run this in Supabase SQL Editor.
--
-- Purpose: let Christian (or any field user) log notes against a job —
-- extra material purchases, surprises found on site, scope changes — so
-- Vince can reconcile at end of job. Free-form timestamped text field,
-- appended (oldest first or newest first is a UI concern, not schema).

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS crew_log TEXT;
