-- Migration 042: Add a Half Bathroom (Floor + Short Walls) template.
--
-- Requested by Vince 2026-06-25. A half bath ("powder room") job is mostly
-- floor work: pull the toilet, retile the floor, reset the toilet. Sometimes
-- the lower outside walls / wainscot get tiled too, so this template has an
-- optional short-walls sub-area.
--
-- The floor portion follows the standard floor build (per project memory):
--   Strata Mat → 254 Platinum (under the mat) → 253 Gold (tile to mat) →
--   grout → caulking. No shower here, so it's Strata Mat, NOT the Schluter
--   waterproofing system used in walk-in showers.
--
-- The short-walls portion offers a CHOICE, surfaced as one addon checkbox:
--   • walls_over_drywall = false (default) → install cement board / GoBoard
--     backer on the walls before tiling (the Cement Board line is gated
--     "!walls_over_drywall").
--   • walls_over_drywall = true → tile directly over the existing drywall;
--     no new backer board. The 253 Gold thinset (priced off total sqft) still
--     bonds the wall tile, so nothing else changes.
-- The floor ALWAYS gets Strata Mat regardless of the wall choice.
--
-- Engine notes:
--   - Sub-area key is `bathroom_floor`, not `floor` — `floor` collides with
--     expr-eval's Math.floor unary op and fails to parse (see migration 025).
--   - `sqft` inside a formula = the sum of all sub_sqft, so Gold/grout/caulk
--     are priced off the whole job (floor + walls); Strata Mat + Platinum are
--     priced off the floor sub-area only.

-- ── 1. The template row ─────────────────────────────────────────────────
INSERT INTO job_templates (
  template_name, job_type,
  base_price_low, base_price_high,
  typical_sqft_low, typical_sqft_high,
  demo_days, install_days,
  typical_materials, notes
) VALUES (
  'Half Bathroom (Floor + Short Walls)', 'Floor',
  1200, 2800,
  15, 50,
  0.5, 1,
  'Strata Mat for the floor, 254 Platinum thinset (under the mat), 253 Gold thinset (tile to membrane + any wall tile), grout, caulking. Short walls: cement board / GoBoard backer unless tiling over the existing drywall.',
  'Powder room / half bath. Pull and reset the toilet, retile the floor (Strata Mat build). Optional short walls / wainscot: choose to tile over existing drywall or replace with cement board / GoBoard via the addon. No shower, so the floor uses Strata Mat, not Schluter. Customer typically provides tile.'
);

-- ── 2. Sub-areas: floor (main) + optional short walls ───────────────────
UPDATE job_templates SET sub_areas = '[
  {"key": "bathroom_floor", "label": "Floor sqft (toilet removed)", "hint": "The half-bath floor. Typical 12-25.", "default_share": 0.75},
  {"key": "short_walls", "label": "Short wall / wainscot sqft (optional)", "hint": "Lower walls or wainscot being tiled. Leave 0 for floor-only.", "default_share": 0.25}
]'::jsonb
WHERE template_name = 'Half Bathroom (Floor + Short Walls)';

-- ── 3. Addon: the drywall vs. backer-board choice ───────────────────────
UPDATE job_templates SET addons = '[
  {"key": "walls_over_drywall", "label": "Short walls: tile over existing drywall (no new backer board)", "hint": "Leave unchecked to install cement board / GoBoard backer on the walls first. The floor always gets Strata Mat regardless of this choice.", "default": false}
]'::jsonb
WHERE template_name = 'Half Bathroom (Floor + Short Walls)';

-- ── 4. Materials formula ────────────────────────────────────────────────
-- Floor (always): Strata Mat + Platinum-under + Gold-over share of thinset.
-- Walls backer: only when NOT tiling over drywall (and only bills if
-- short_walls > 0, since ceil(0/15)=0 then clamps to min 0).
UPDATE job_templates SET materials_formula = '[
  {"item": "Strata Mat (Laticrete uncoupling membrane)", "formula": "ceil(sub_sqft.bathroom_floor * 1.10)", "min": 15, "max": 50},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sub_sqft.bathroom_floor / 50)", "min": 1, "max": 2},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 50)", "min": 1, "max": 2},
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sub_sqft.short_walls / 15)", "min": 0, "max": 4, "applies_when": "!walls_over_drywall"},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "ceil(sqft / 40)", "min": 1, "max": 2}
]'::jsonb
WHERE template_name = 'Half Bathroom (Floor + Short Walls)';
