-- Migration 028: Add Kitchen Floor templates.
--
-- Bathroom Floor templates were being used as a workaround. Kitchens differ:
--   - Open-floor pace: ~100 sqft/day for a 2-person crew (vs 25-50 sqft/day
--     for bathroom floors due to cuts around toilets/vanities).
--   - No toilet/vanity removal — customer arranges appliance moving.
--   - DITRA uncoupling membrane often needed over plywood subfloors.
--   - Customer typically provides tile, transition strips, and shoe molding;
--     base shoe re-install handled by carpenter, not us.
--
-- Pricing math: at $1,000/day average crew × 100 sqft/day, plus customer-
-- provided tile, materials run ~$5-7/sqft delivered → sticker comes in
-- below the bathroom-renovation tier as expected.

-- ── Kitchen Floor (Small): 50-100 sqft, 1 install + 0.5 demo ────────────
INSERT INTO job_templates (
  template_name, job_type,
  base_price_low, base_price_high,
  typical_sqft_low, typical_sqft_high,
  demo_days, install_days,
  typical_materials, notes
) VALUES (
  'Kitchen Floor (Small)', 'Floor',
  2800, 3800,
  50, 100,
  0.5, 1,
  'Cement board (5-6 sheets), thinset 253 Gold (2 bags), grout (1 bag), caulking, transition strips',
  'Galley or eat-in kitchen. Customer provides tile, transitions, shoe molding. Customer arranges appliance moving — we don''t disconnect gas or water lines. Watch for plywood deflection on older homes.'
);

-- ── Kitchen Floor (Large): 100-250 sqft, 1-2.5 install + 0.5-1 demo ─────
INSERT INTO job_templates (
  template_name, job_type,
  base_price_low, base_price_high,
  typical_sqft_low, typical_sqft_high,
  demo_days, install_days,
  typical_materials, notes
) VALUES (
  'Kitchen Floor (Large)', 'Floor',
  5000, 8500,
  100, 250,
  1, 2.5,
  'Cement board (8-12 sheets), DITRA where subfloor calls for it, thinset 253 Gold (3-5 bags), grout (1-2 bags), caulking, transition strips',
  'Open-concept kitchen. Customer provides tile, transitions, shoe molding. Often needs DITRA on plywood subfloor — bumps materials cost. Appliance moving by customer.'
);

-- Materials formulas for the new templates. Pattern matches migration 022:
-- per-sqft coverage assumptions, with min/max clamps to keep low-end and
-- high-end jobs from sliding into nonsense quantities.

UPDATE job_templates SET materials_formula = '[
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sqft / 15)", "min": 4, "max": 8},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 40)", "min": 2, "max": 3},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 60)", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "1", "min": 1, "max": 2}
]'::jsonb
WHERE template_name = 'Kitchen Floor (Small)';

UPDATE job_templates SET materials_formula = '[
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sqft / 15)", "min": 7, "max": 18},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 40)", "min": 3, "max": 6},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 60)", "min": 2, "max": 4},
  {"item": "Caulking", "formula": "ceil(sqft / 80)", "min": 1, "max": 3}
]'::jsonb
WHERE template_name = 'Kitchen Floor (Large)';
