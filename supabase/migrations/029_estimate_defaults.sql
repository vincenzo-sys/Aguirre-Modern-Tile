-- Migration 029: Editable estimate defaults.
--
-- Until now, warranty terms, payment schedule, and accepted payment methods
-- have been hardcoded English in src/app/estimates/[token]/page.tsx and the
-- dashboard estimate page. That meant editing for one job required editing
-- code, and there was no way for Vince to change canonical wording without
-- a deploy.
--
-- This migration introduces the snapshot pattern:
--   1. estimate_defaults — a single-row table holding the canonical text
--      Vince edits in /dashboard/settings/estimate-defaults.
--   2. job_templates.customer_provides_default — per-template text snippet
--      describing what the customer typically supplies for that scope.
--   3. jobs.warranty_text / payment_terms_text / payment_methods —
--      per-job editable copies, snapshotted from estimate_defaults at
--      estimate-generation time. Edits here only affect that one job.
--
-- The public estimate viewer reads from job columns; if null (legacy jobs
-- generated before this migration), it falls back to the existing hardcoded
-- text so nothing breaks.

-- ── 1. Singleton estimate_defaults table ────────────────────────────────
CREATE TABLE IF NOT EXISTS estimate_defaults (
  id integer PRIMARY KEY DEFAULT 1,
  warranty_years integer NOT NULL DEFAULT 3,
  warranty_text text NOT NULL DEFAULT '',
  payment_terms_text text NOT NULL DEFAULT '',
  payment_methods jsonb NOT NULL DEFAULT '[]'::jsonb,
  deposit_percent numeric NOT NULL DEFAULT 10,
  deposit_refund_window_hours integer NOT NULL DEFAULT 48,
  customer_provides_default text NOT NULL DEFAULT '',
  -- created_at is required so the generic /api/reference list endpoint can
  -- sort the row even though there's only ever one.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estimate_defaults_singleton CHECK (id = 1)
);

-- Seed the singleton row with Vince's canonical wording.
INSERT INTO estimate_defaults (
  id,
  warranty_years,
  warranty_text,
  payment_terms_text,
  payment_methods,
  deposit_percent,
  deposit_refund_window_hours,
  customer_provides_default
) VALUES (
  1,
  3,
  'Aguirre Modern Tile warrants all installation labor for 3 years from the date of project completion. If anything we installed cracks, comes loose, or fails due to our workmanship, we will return and fix it at no charge. This warranty covers labor only — tile, grout, and other materials carry their respective manufacturer warranties.',
  '10% deposit reserves your install date. Deposit is fully refundable until 48 hours before the scheduled start of the project. Final payment is due upon project completion and customer walkthrough sign-off.',
  '["Check", "Credit Card", "Debit Card", "Bank Transfer", "Zelle"]'::jsonb,
  10,
  48,
  'Tile, grout color preference, any decorative or specialty features'
)
ON CONFLICT (id) DO NOTHING;

-- ── 2. Per-template "customer provides" default text ────────────────────
ALTER TABLE job_templates
  ADD COLUMN IF NOT EXISTS customer_provides_default text;

-- Seed sensible defaults per template. Editable in the settings UI later.
UPDATE job_templates SET customer_provides_default =
  'Tile and grout color preference. We supply all installation materials (thinset, waterproofing, grout, caulking).'
  WHERE template_name LIKE 'Backsplash%';

UPDATE job_templates SET customer_provides_default =
  'Tile, glass shower door (we coordinate with your glass installer), niche shelf preference, plumbing fixtures (rough-in done by your plumber).'
  WHERE template_name LIKE 'Walk-in Shower%' OR template_name LIKE 'Standard Tub Surround%';

UPDATE job_templates SET customer_provides_default =
  'Tile, plumbing fixtures (rough-in by your plumber), grout color preference. Toilet removal is included; reinstall handled by your plumber.'
  WHERE template_name = 'Tub Surround + Bathroom Floor' OR template_name LIKE 'Bathroom Floor%';

UPDATE job_templates SET customer_provides_default =
  'Tile and grout color preference. Note: demoing an existing shower floor may compromise the pan/waterproofing — discuss scope with us before scheduling.'
  WHERE template_name = 'Shower Floor Only';

UPDATE job_templates SET customer_provides_default =
  'Tile, transition strips, shoe molding, appliance moving. Base shoe re-install handled by your carpenter. We do not disconnect gas or water lines.'
  WHERE template_name LIKE 'Kitchen Floor%';

UPDATE job_templates SET customer_provides_default =
  'Tile or stone, grout color preference. Confirm material is rated for the heat exposure of your fireplace.'
  WHERE template_name = 'Fireplace Surround';

-- ── 3. Per-job snapshotted columns ──────────────────────────────────────
-- jobs.customer_provides already exists. Adding the rest.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS warranty_text text,
  ADD COLUMN IF NOT EXISTS payment_terms_text text,
  ADD COLUMN IF NOT EXISTS payment_methods jsonb;

COMMENT ON COLUMN jobs.warranty_text IS 'Snapshotted from estimate_defaults.warranty_text at estimate-generate time. Editable per-job in dashboard.';
COMMENT ON COLUMN jobs.payment_terms_text IS 'Snapshotted from estimate_defaults.payment_terms_text at estimate-generate time. Editable per-job.';
COMMENT ON COLUMN jobs.payment_methods IS 'Snapshotted from estimate_defaults.payment_methods. JSONB array of strings shown as chips on the public estimate.';
