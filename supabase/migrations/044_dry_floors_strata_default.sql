-- Migration 044: dry floors default to Strata Mat in the combo + wet templates.
--
-- Extends migration 043's "Strata default, cement board on request" rule to the
-- templates whose floor was still modeled as cement board (or as a fraction of
-- total sqft):
--   • Standard Tub Surround        — optional outside_floor
--   • Walk-in Shower (Small)        — optional outside_floor (dry, outside the pan)
--   • Walk-in Shower (Large)        — optional outside_floor
--   • Tub Surround + Bathroom Floor — the bathroom_floor sub-area
--
-- For the three wet templates, ONLY the dry outside-floor substrate changes:
-- the cement-board line becomes Strata Mat + 254 Platinum (under), gated
-- !cement_board_floor, with a Cement Board fallback when the option is ticked.
-- The wet shower pan stays Schluter, and the wall / total-sqft thinset + grout
-- lines are untouched — so the only price movement is the floor substrate, and
-- only when an outside floor is actually tiled (mins are 0).
--
-- Tub Surround + Bathroom Floor also gets a correctness fix: it priced the
-- floor + walls as fixed fractions of total sqft (0.45 / 0.55) even though it
-- has walls / bathroom_floor sub-areas. Now it reads the sub-areas directly.
--
-- The 253 Gold "over" thinset for the dry floor is already covered by each
-- template's existing total-sqft Gold line, so no separate floor-Gold is added.
-- Strata Mat coverage = 1, Platinum = 45, Cement Board = 15 (catalog).

-- ── Add the cement_board_floor option (preserving existing addons) ───────
UPDATE job_templates SET addons = '[
  {"key": "large_format", "label": "Large-format tile (12\"+ on the long side)", "hint": "Switches wall thinset to Platinum.", "default": false},
  {"key": "cement_board_floor", "label": "Outside floor: cement board instead of Strata Mat", "hint": "Only applies if a bathroom floor outside the tub is being tiled. Default is Strata Mat.", "default": false}
]'::jsonb
WHERE template_name = 'Standard Tub Surround';

UPDATE job_templates SET addons = '[
  {"key": "has_shower_tray", "label": "Includes Schluter Kerdi shower tray + drain", "hint": "Default 48x72 Center ($271) — edit the line item if a different size fits better.", "default": true},
  {"key": "has_curb", "label": "Includes shower curb", "hint": "Walk-in showers usually have a curb unless it''s curbless.", "default": true},
  {"key": "large_format", "label": "Large-format tile (12\"+ on the long side)", "hint": "Switches setting bed to Thinset 254 Platinum. Costs more but mandatory for large-format.", "default": false},
  {"key": "cement_board_floor", "label": "Outside floor: cement board instead of Strata Mat", "hint": "Only applies if a bathroom floor outside the shower is being tiled. Default is Strata Mat.", "default": false}
]'::jsonb
WHERE template_name = 'Walk-in Shower (Small)';

UPDATE job_templates SET addons = '[
  {"key": "has_shower_tray", "label": "Includes Schluter Kerdi shower tray + drain", "hint": "Default 72x72 Center ($370) — edit the line item if a different size fits better.", "default": true},
  {"key": "has_curb", "label": "Includes shower curb", "hint": "Walk-in showers usually have a curb unless it''s curbless.", "default": true},
  {"key": "large_format", "label": "Large-format tile (12\"+ on the long side)", "hint": "Switches setting bed to Thinset 254 Platinum.", "default": false},
  {"key": "cement_board_floor", "label": "Outside floor: cement board instead of Strata Mat", "hint": "Only applies if a bathroom floor outside the shower is being tiled. Default is Strata Mat.", "default": false}
]'::jsonb
WHERE template_name = 'Walk-in Shower (Large)';

UPDATE job_templates SET addons = '[
  {"key": "large_format", "label": "Large-format tile (12\"+ on the long side)", "hint": "Switches setting bed to Platinum.", "default": false},
  {"key": "cement_board_floor", "label": "Floor: cement board install instead of Strata Mat", "hint": "Default is Strata Mat (254 Platinum under + 253 Gold over). Tick only if the customer specifically wants a cement-board floor.", "default": false}
]'::jsonb
WHERE template_name = 'Tub Surround + Bathroom Floor';

-- ── Standard Tub Surround — dry outside floor → Strata default ──────────
UPDATE job_templates SET materials_formula = '[
  {"item": "GoBoard 1/2\" (3x5)", "formula": "ceil(sub_sqft.walls / 15)", "min": 5, "max": 10},
  {"item": "GoBoard Sealant", "formula": "ceil(sub_sqft.walls / 40)", "min": 2, "max": 4},
  {"item": "GoBoard Caps & Screws", "formula": "1", "min": 1, "max": 2},
  {"item": "Strata Mat (Laticrete uncoupling membrane)", "formula": "ceil(sub_sqft.outside_floor * 1.10 / coverage)", "min": 0, "max": 40, "applies_when": "!cement_board_floor"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sub_sqft.outside_floor * 0.90 / coverage)", "min": 0, "max": 2, "applies_when": "!cement_board_floor"},
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sub_sqft.outside_floor / coverage)", "min": 0, "max": 5, "applies_when": "cement_board_floor"},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 40)", "min": 2, "max": 4, "applies_when": "!large_format"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft / 28)", "min": 2, "max": 5, "applies_when": "large_format"},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "2", "min": 2, "max": 3}
]'::jsonb
WHERE template_name = 'Standard Tub Surround';

-- ── Walk-in Shower (Small) — dry outside floor → Strata default ─────────
UPDATE job_templates SET materials_formula = '[
  {"item": "GoBoard 1/2\" (3x5)", "formula": "ceil(sub_sqft.walls / 12)", "min": 6, "max": 12},
  {"item": "GoBoard Sealant", "formula": "ceil(sub_sqft.walls / 35)", "min": 2, "max": 5},
  {"item": "GoBoard Caps & Screws", "formula": "ceil(sub_sqft.walls / 80)", "min": 1, "max": 3},
  {"item": "Strata Mat (Laticrete uncoupling membrane)", "formula": "ceil(sub_sqft.outside_floor * 1.10 / coverage)", "min": 0, "max": 40, "applies_when": "!cement_board_floor"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sub_sqft.outside_floor * 0.90 / coverage)", "min": 0, "max": 2, "applies_when": "!cement_board_floor"},
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sub_sqft.outside_floor / coverage)", "min": 0, "max": 6, "applies_when": "cement_board_floor"},
  {"item": "Schluter Kerdi Shower Tray 48x72 Center", "formula": "1", "min": 1, "max": 1, "applies_when": "has_shower_tray"},
  {"item": "Schluter Kerdi-Drain 4x4 ABS Stainless", "formula": "1", "min": 1, "max": 1, "applies_when": "has_shower_tray"},
  {"item": "Schluter Kerdi-Board Curb 48x6", "formula": "1", "min": 1, "max": 1, "applies_when": "has_curb"},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 50)", "min": 2, "max": 4, "applies_when": "!large_format"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft / 35)", "min": 2, "max": 5, "applies_when": "large_format"},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 100)", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "2", "min": 2, "max": 4}
]'::jsonb
WHERE template_name = 'Walk-in Shower (Small)';

-- ── Walk-in Shower (Large) — dry outside floor → Strata default ─────────
UPDATE job_templates SET materials_formula = '[
  {"item": "GoBoard 1/2\" (3x5)", "formula": "ceil(sub_sqft.walls / 12)", "min": 10, "max": 18},
  {"item": "GoBoard Sealant", "formula": "ceil(sub_sqft.walls / 40)", "min": 3, "max": 6},
  {"item": "GoBoard Caps & Screws", "formula": "ceil(sub_sqft.walls / 80)", "min": 2, "max": 4},
  {"item": "Strata Mat (Laticrete uncoupling membrane)", "formula": "ceil(sub_sqft.outside_floor * 1.10 / coverage)", "min": 0, "max": 60, "applies_when": "!cement_board_floor"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sub_sqft.outside_floor * 0.90 / coverage)", "min": 0, "max": 3, "applies_when": "!cement_board_floor"},
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sub_sqft.outside_floor / coverage)", "min": 0, "max": 8, "applies_when": "cement_board_floor"},
  {"item": "Schluter Kerdi Shower Tray 72x72 Center", "formula": "1", "min": 1, "max": 1, "applies_when": "has_shower_tray"},
  {"item": "Schluter Kerdi-Drain 4x4 ABS Stainless", "formula": "1", "min": 1, "max": 1, "applies_when": "has_shower_tray"},
  {"item": "Schluter Kerdi-Board Curb 48x6", "formula": "1", "min": 1, "max": 1, "applies_when": "has_curb"},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 55)", "min": 3, "max": 5, "applies_when": "!large_format"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft / 38)", "min": 3, "max": 6, "applies_when": "large_format"},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 100)", "min": 1, "max": 3},
  {"item": "Caulking", "formula": "ceil(sqft / 60)", "min": 3, "max": 5}
]'::jsonb
WHERE template_name = 'Walk-in Shower (Large)';

-- ── Tub Surround + Bathroom Floor — read sub-areas + Strata default ─────
-- Fixes the fraction-of-total pricing (was 0.55 walls / 0.45 floor) to read
-- sub_sqft.walls and sub_sqft.bathroom_floor directly, and defaults the floor
-- to Strata Mat (was cement-board-less: it had Strata already, but keyed off
-- the 0.45 fraction). Cement-board option added.
UPDATE job_templates SET materials_formula = '[
  {"item": "GoBoard 1/2\" (3x5)", "formula": "ceil(sub_sqft.walls / 15)", "min": 5, "max": 10},
  {"item": "GoBoard Sealant", "formula": "ceil(sub_sqft.walls / 30)", "min": 3, "max": 5},
  {"item": "GoBoard Caps & Screws", "formula": "1", "min": 1, "max": 2},
  {"item": "Strata Mat (Laticrete uncoupling membrane)", "formula": "ceil(sub_sqft.bathroom_floor * 1.10 / coverage)", "min": 0, "max": 80, "applies_when": "!cement_board_floor"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sub_sqft.bathroom_floor * 0.90 / coverage)", "min": 0, "max": 3, "applies_when": "!cement_board_floor"},
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sub_sqft.bathroom_floor / coverage)", "min": 0, "max": 6, "applies_when": "cement_board_floor"},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 35)", "min": 3, "max": 5},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 2, "max": 3},
  {"item": "Caulking", "formula": "2", "min": 2, "max": 4}
]'::jsonb
WHERE template_name = 'Tub Surround + Bathroom Floor';
