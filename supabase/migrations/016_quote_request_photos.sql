-- Migration 016: Photos attached to leads (customer-uploaded on quote form)
-- Run this in Supabase SQL Editor.
--
-- Purpose:
--   Website quote form already collects photo uploads in the UI, but they
--   were never persisted. Store them alongside the lead so the dashboard
--   can show them on the lead detail page — helps estimate scope before
--   the site visit.
--
-- Storage:
--   Create a PRIVATE bucket named 'quote-photos' in Supabase Dashboard
--   (Storage → New bucket → name: quote-photos, Public: off) BEFORE running
--   this migration. Files are keyed as <quote_request_id>/<uuid>-<filename>.

CREATE TABLE IF NOT EXISTS quote_request_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_request_id UUID NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_request_photos_quote
  ON quote_request_photos(quote_request_id);

ALTER TABLE quote_request_photos ENABLE ROW LEVEL SECURITY;

-- Team members (authenticated dashboard users) can read lead photos.
-- Inserts/deletes happen via service role in API routes, so no insert
-- policy needed — anon/authenticated clients can't write directly.
CREATE POLICY "Team read quote request photos"
  ON quote_request_photos
  FOR SELECT
  TO authenticated
  USING (is_team_member());

-- Storage policies for the 'quote-photos' bucket.
-- Public quote form submits via /api/quotes/[id]/photos which uses the
-- service role key, bypassing RLS for the write path. Reads on the
-- dashboard go through signed URLs (also via service role), so we only
-- need a team-read policy here for completeness.
CREATE POLICY "Team view quote photos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'quote-photos' AND (SELECT is_team_member()));

CREATE POLICY "Owner delete quote photos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'quote-photos' AND (SELECT is_owner()));
