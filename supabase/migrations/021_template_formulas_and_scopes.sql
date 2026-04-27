-- Migration 021: Template formulas + job scopes (Phase B of ops-machine plan).
--
-- Adds two things:
--   1. Formula columns on job_templates so material/labor quantities derive
--      from sqft (and other variables) instead of being hardcoded in
--      src/lib/estimator.ts:67. This is what lets a template scale with the
--      actual size of the project: "Walk-in Shower" no longer always means
--      10 sheets of GoBoard — it means ceil(sqft / 15), clamped to a min of 6.
--
--   2. A scopes JSONB column on jobs so a single job can stack multiple
--      template instances ("Master Bath" + "Guest Bath" + "Backsplash"). The
--      derived line_items keep being the source of truth for Stripe / the
--      public estimate page / the materials roll-up; scopes is just the
--      authoring layer that produces them.
--
-- Backward compatibility: both new columns default to empty arrays/objects.
-- Existing templates without formulas fall through to the legacy
-- TEMPLATE_MATERIALS lookup in src/lib/estimator.ts. Existing jobs without
-- scopes render their line_items unchanged. Migration 022 backfills formulas
-- for the 10 seeded templates.

-- ============================================================
-- 1. Template formulas
-- ============================================================
ALTER TABLE job_templates
  ADD COLUMN IF NOT EXISTS materials_formula JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS labor_formula JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN job_templates.materials_formula IS
  'Bill of materials with formulas. Each entry: {item, formula, min?, max?}. '
  'Formula is evaluated against {sqft, linear_ft, height_ft, addons.*} via '
  'src/lib/estimator/formulas.ts. Result is rounded UP to int and clamped to '
  '[min, max]. Empty array = fall back to legacy hardcoded quantities.';

COMMENT ON COLUMN job_templates.labor_formula IS
  'Labor day formulas. Shape: {demo_days, install_days, min_demo?, min_install?}. '
  'demo_days/install_days are formula strings evaluated against the same vars. '
  'Empty object = use the column-level demo_days/install_days as static values.';

-- ============================================================
-- 2. Job scopes
-- ============================================================
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS scopes JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN jobs.scopes IS
  'Authoring layer for multi-scope estimates. Array of '
  '{id, label, template_name, sqft, addons[], customer_provides[]}. '
  'Generating an estimate walks scopes, evaluates each template''s formulas, '
  'and writes the accumulated result to line_items (still the source of truth '
  'for Stripe, public estimate page, materials roll-up). Empty array = legacy '
  'single-template job; line_items is authored directly.';
