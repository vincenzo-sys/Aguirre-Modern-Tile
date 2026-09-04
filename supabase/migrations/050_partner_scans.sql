-- Migration 050: partner_scans — QR scan counter for the distributor partner
-- program. Run once in the Supabase SQL Editor (CREATE POLICY is not
-- idempotent): node scripts/run-migration.mjs
--
-- OPTIONAL. The partner funnel works without this table: lead attribution
-- rides on quote_requests.source = 'partner' + answers->>'partner', which
-- needed no schema change. This table only answers the question leads can't:
-- how many people scanned the card and did NOT convert.
--
--   scans 0, leads 0   -> placement problem (card is not where hands are)
--   scans 40, leads 0  -> landing page problem
--   scans 40, leads 12 -> working; go sign the next showroom
--
-- Until this is run, /api/partners/scan logs a warning and returns 204 —
-- nothing customer-facing breaks.
--
-- Intentionally NOT tied to a customer: a scan is anonymous. No IP is stored
-- either; the user agent is enough to tell a phone from a crawler, and
-- storing showroom-visitor IPs buys nothing.

CREATE TABLE partner_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_slug TEXT NOT NULL,          -- matches src/data/partners.ts slug
  location_code TEXT,                  -- which showroom door, e.g. 'watertown'
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_partner_scans_slug ON partner_scans (partner_slug, created_at DESC);
CREATE INDEX idx_partner_scans_created ON partner_scans (created_at DESC);

-- Service-role only. The scan endpoint runs server-side with the service key
-- (which bypasses RLS); enabling RLS with no policy means anon/authenticated
-- clients cannot read or write scan data directly.
ALTER TABLE partner_scans ENABLE ROW LEVEL SECURITY;
