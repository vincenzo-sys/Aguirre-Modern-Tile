-- Migration 022: Seed materials_formula for the 10 canonical templates.
--
-- These formulas port the hardcoded TEMPLATE_MATERIALS quantities from
-- src/lib/estimator.ts:67 into sqft-derived expressions. The min floors
-- preserve current behavior for jobs sized at the low end of each template's
-- typical range — e.g. "Walk-in Shower (Small)" produced 10 sheets of GoBoard
-- before; with `ceil(sqft / 12)` and min=8 it still produces 10 at 110 sqft
-- and scales sensibly to 14+ for larger showers.
--
-- Coverage assumptions (refined from materials_pricing.coverage values + field
-- experience):
--   - Cement/GoBoard 3x5 sheet: ~15 sqft per sheet
--   - Thinset 253 Gold (50 lb): ~50 sqft per bag for floor, ~40 for wall
--   - Grout 25 lb bag: ~50 sqft
--   - Caulking 10 oz tube: ~30-40 linear ft of joint
--   - GoBoard Sealant: ~30-40 sqft per tube of seam coverage
--   - GoBoard Caps & Screws: 1 box per ~150 sqft
--
-- labor_formula is intentionally left empty for now — the existing
-- demo_days / install_days static columns continue to drive labor estimation.
-- We can add per-template labor formulas in a future migration once we have
-- enough completed-job data to fit reasonable curves.

-- ── Backsplashes ────────────────────────────────────────────────────────
UPDATE job_templates SET materials_formula = '[
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 60)", "min": 1, "max": 4},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 1, "max": 3},
  {"item": "Caulking", "formula": "ceil(sqft / 30)", "min": 1, "max": 4}
]'::jsonb
WHERE template_name = 'Backsplash (Standard)';

UPDATE job_templates SET materials_formula = '[
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 60)", "min": 1, "max": 5},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 1, "max": 3},
  {"item": "Caulking", "formula": "ceil(sqft / 25)", "min": 2, "max": 5}
]'::jsonb
WHERE template_name = 'Backsplash (Large/Complex)';

-- ── Floors ──────────────────────────────────────────────────────────────
UPDATE job_templates SET materials_formula = '[
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sqft / 15)", "min": 2, "max": 6},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 50)", "min": 1, "max": 3},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "1", "min": 1, "max": 2}
]'::jsonb
WHERE template_name = 'Bathroom Floor (Small)';

UPDATE job_templates SET materials_formula = '[
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sqft / 15)", "min": 4, "max": 10},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 40)", "min": 2, "max": 4},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 1, "max": 3},
  {"item": "Caulking", "formula": "ceil(sqft / 40)", "min": 2, "max": 4}
]'::jsonb
WHERE template_name = 'Bathroom Floor (Medium)';

-- ── Fireplace ───────────────────────────────────────────────────────────
UPDATE job_templates SET materials_formula = '[
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sqft / 15)", "min": 2, "max": 5},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 50)", "min": 1, "max": 2},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 1, "max": 2}
]'::jsonb
WHERE template_name = 'Fireplace Surround';

-- ── Shower floor only ───────────────────────────────────────────────────
UPDATE job_templates SET materials_formula = '[
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 50)", "min": 1, "max": 2},
  {"item": "Grout 25 lb (bag)", "formula": "1", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "1", "min": 1, "max": 2}
]'::jsonb
WHERE template_name = 'Shower Floor Only';

-- ── Tub surround ────────────────────────────────────────────────────────
UPDATE job_templates SET materials_formula = '[
  {"item": "GoBoard 1/2\" (3x5)", "formula": "ceil(sqft / 15)", "min": 6, "max": 10},
  {"item": "GoBoard Sealant", "formula": "ceil(sqft / 40)", "min": 2, "max": 4},
  {"item": "GoBoard Caps & Screws", "formula": "1", "min": 1, "max": 2},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 40)", "min": 2, "max": 4},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "2", "min": 2, "max": 3}
]'::jsonb
WHERE template_name = 'Standard Tub Surround';

-- ── Combo: tub surround + bathroom floor ────────────────────────────────
-- Roughly 55% wall (GoBoard) / 45% floor (cement board) by area.
UPDATE job_templates SET materials_formula = '[
  {"item": "GoBoard 1/2\" (3x5)", "formula": "ceil(sqft * 0.55 / 15)", "min": 5, "max": 10},
  {"item": "GoBoard Sealant", "formula": "ceil(sqft * 0.55 / 30)", "min": 3, "max": 5},
  {"item": "GoBoard Caps & Screws", "formula": "1", "min": 1, "max": 2},
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sqft * 0.45 / 15)", "min": 3, "max": 6},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 35)", "min": 3, "max": 5},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 2, "max": 3},
  {"item": "Caulking", "formula": "2", "min": 2, "max": 4}
]'::jsonb
WHERE template_name = 'Tub Surround + Bathroom Floor';

-- ── Walk-in showers ─────────────────────────────────────────────────────
-- Showers wrap walls + floor in waterproof backer; coverage drops to ~12 sqft
-- per sheet to account for waste from cuts around niches and bench.
UPDATE job_templates SET materials_formula = '[
  {"item": "GoBoard 1/2\" (3x5)", "formula": "ceil(sqft / 12)", "min": 8, "max": 14},
  {"item": "GoBoard Sealant", "formula": "ceil(sqft / 35)", "min": 3, "max": 5},
  {"item": "GoBoard Caps & Screws", "formula": "ceil(sqft / 80)", "min": 2, "max": 3},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 50)", "min": 2, "max": 4},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 100)", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "2", "min": 2, "max": 4}
]'::jsonb
WHERE template_name = 'Walk-in Shower (Small)';

UPDATE job_templates SET materials_formula = '[
  {"item": "GoBoard 1/2\" (3x5)", "formula": "ceil(sqft / 12)", "min": 12, "max": 20},
  {"item": "GoBoard Sealant", "formula": "ceil(sqft / 40)", "min": 4, "max": 6},
  {"item": "GoBoard Caps & Screws", "formula": "ceil(sqft / 80)", "min": 2, "max": 4},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 55)", "min": 3, "max": 5},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 100)", "min": 1, "max": 3},
  {"item": "Caulking", "formula": "ceil(sqft / 60)", "min": 3, "max": 5}
]'::jsonb
WHERE template_name = 'Walk-in Shower (Large)';
