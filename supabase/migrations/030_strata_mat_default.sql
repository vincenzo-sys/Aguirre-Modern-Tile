-- Migration 030: Floors default to Strata Mat (Laticrete uncoupling membrane).
--
-- Correction from Vince 2026-05-01: floor tile installs do NOT use cement
-- board as the default substrate. Standard practice is Laticrete Strata Mat
-- — an uncoupling membrane that goes directly over plywood subfloor.
-- Faster to install, thinner build-up, no screwing 50 lb sheets every 6".
--
-- Cement board stays in materials_pricing for the rare exception (bouncy
-- subfloors, level-up situations, etc.). Vince swaps the line item per-job
-- in the dashboard estimate editor when those come up.
--
-- This migration:
--   1. Inserts Strata Mat into materials_pricing if not already present.
--   2. Rewrites materials_formula on the 4 pure-floor templates and the
--      floor portion of Tub Surround + Bathroom Floor to spec Strata Mat.
--   3. Updates typical_materials prose on the same 5 templates.
--
-- Walls and showers continue to use GoBoard / cement board — this rule is
-- floors-only.

-- ── 1. Add Strata Mat to materials_pricing ──────────────────────────────
-- Priced per square foot to match the per-sqft pattern used for other
-- area-coverage items (e.g. Schluter Ditra-Heat). Coverage = 1 sq ft so
-- the formula evaluates directly against scope sqft.
INSERT INTO materials_pricing (item, category, your_cost, price_to_customer, markup_percent, coverage, unit)
SELECT
  'Strata Mat (Laticrete uncoupling membrane)',
  'Backer Board',
  1.30,
  1.60,
  0.23,
  1.00,
  'sq ft'
WHERE NOT EXISTS (
  SELECT 1 FROM materials_pricing
  WHERE item = 'Strata Mat (Laticrete uncoupling membrane)'
);

-- ── 2. Rewrite floor template materials_formula ────────────────────────

-- Bathroom Floor (Small) — was 3 sheets cement board → Strata Mat per sqft
UPDATE job_templates SET materials_formula = '[
  {"item": "Strata Mat (Laticrete uncoupling membrane)", "formula": "ceil(sqft * 1.10)", "min": 25, "max": 60},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 50)", "min": 1, "max": 3},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "1", "min": 1, "max": 2}
]'::jsonb
WHERE template_name = 'Bathroom Floor (Small)';

-- Bathroom Floor (Medium) — was 5-6 sheets cement board → Strata Mat
UPDATE job_templates SET materials_formula = '[
  {"item": "Strata Mat (Laticrete uncoupling membrane)", "formula": "ceil(sqft * 1.10)", "min": 50, "max": 120},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 40)", "min": 2, "max": 4},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 1, "max": 3},
  {"item": "Caulking", "formula": "ceil(sqft / 40)", "min": 2, "max": 4}
]'::jsonb
WHERE template_name = 'Bathroom Floor (Medium)';

-- Kitchen Floor (Small) — was 5-6 sheets cement board → Strata Mat
UPDATE job_templates SET materials_formula = '[
  {"item": "Strata Mat (Laticrete uncoupling membrane)", "formula": "ceil(sqft * 1.10)", "min": 50, "max": 120},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 40)", "min": 2, "max": 3},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 60)", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "1", "min": 1, "max": 2}
]'::jsonb
WHERE template_name = 'Kitchen Floor (Small)';

-- Kitchen Floor (Large) — was 8-12 sheets cement board → Strata Mat
UPDATE job_templates SET materials_formula = '[
  {"item": "Strata Mat (Laticrete uncoupling membrane)", "formula": "ceil(sqft * 1.10)", "min": 100, "max": 280},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 40)", "min": 3, "max": 6},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 60)", "min": 2, "max": 4},
  {"item": "Caulking", "formula": "ceil(sqft / 80)", "min": 1, "max": 3}
]'::jsonb
WHERE template_name = 'Kitchen Floor (Large)';

-- Tub Surround + Bathroom Floor — keep GoBoard for walls (55%), Strata Mat
-- for the floor portion (45%). This is the only template that mixes the two.
UPDATE job_templates SET materials_formula = '[
  {"item": "GoBoard 1/2\" (3x5)", "formula": "ceil(sqft * 0.55 / 15)", "min": 5, "max": 10},
  {"item": "GoBoard Sealant", "formula": "ceil(sqft * 0.55 / 30)", "min": 3, "max": 5},
  {"item": "GoBoard Caps & Screws", "formula": "1", "min": 1, "max": 2},
  {"item": "Strata Mat (Laticrete uncoupling membrane)", "formula": "ceil(sqft * 0.45 * 1.10)", "min": 25, "max": 80},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 35)", "min": 3, "max": 5},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 2, "max": 3},
  {"item": "Caulking", "formula": "2", "min": 2, "max": 4}
]'::jsonb
WHERE template_name = 'Tub Surround + Bathroom Floor';

-- ── 3. Update typical_materials prose ───────────────────────────────────

UPDATE job_templates SET typical_materials =
  'Strata Mat (Laticrete uncoupling membrane), thinset 253 Gold (1 bag), grout (1 bag), caulking. Cement board substituted on the rare bouncy / level-up subfloor.'
WHERE template_name = 'Bathroom Floor (Small)';

UPDATE job_templates SET typical_materials =
  'Strata Mat (Laticrete uncoupling membrane), thinset 253 Gold (2 bags), grout (1 bag), caulking. Cement board substituted on the rare bouncy / level-up subfloor.'
WHERE template_name = 'Bathroom Floor (Medium)';

UPDATE job_templates SET typical_materials =
  'Strata Mat (Laticrete uncoupling membrane), thinset 253 Gold (2 bags), grout (1 bag), caulking, transition strips. Customer provides tile. Cement board substituted on the rare bouncy subfloor.'
WHERE template_name = 'Kitchen Floor (Small)';

UPDATE job_templates SET typical_materials =
  'Strata Mat (Laticrete uncoupling membrane), thinset 253 Gold (3-5 bags), grout (1-2 bags), caulking, transition strips. Customer provides tile. Cement board substituted on the rare bouncy subfloor.'
WHERE template_name = 'Kitchen Floor (Large)';

UPDATE job_templates SET typical_materials =
  'GoBoard (6 sheets) for walls, Strata Mat for floor portion, thinset 253 Gold (3 bags), grout (1 bag), caulking, GoBoard sealant'
WHERE template_name = 'Tub Surround + Bathroom Floor';

-- Notes: keep the existing per-template notes intact — they already mention
-- "watch for subfloor issues" and that's still relevant.
