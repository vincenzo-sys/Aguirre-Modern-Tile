-- Migration 043: Floor install = Strata Mat by default, cement board on request,
-- and move thinset/grout/board bag counts onto the catalog `coverage` field.
--
-- Two changes, both requested by Vince 2026-06-26:
--
-- 1. Gap A — give every floor template a `cement_board_floor` addon. Default
--    OFF, so the standard build stays Strata Mat + 254 Platinum (under) + 253
--    Gold (over) — unchanged. When a customer asks for a cement-board floor
--    instead, ticking it swaps the Strata-Mat + Platinum lines for a Cement
--    Board line; Gold still sets the tile. Mirrors the half-bath's
--    walls_over_drywall toggle.
--
-- 2. Gap B — "one source of truth": every area-scaling material now derives its
--    bag/sheet count from the catalog `coverage` field via the new `coverage`
--    formula variable (added in the 12c2c33 engine change). Formula shape:
--        ceil(area * waste / coverage)
--    where `waste` is the documented real-world derate vs the bag's rated
--    coverage (floors trowel heavier than the rated number, grout for smaller
--    residential tile covers ~half its rated sqft, etc.). The waste factors
--    below are chosen so that AT THE CURRENT CATALOG COVERAGE the bag counts
--    are identical to the pre-043 formulas (price-neutral) — verified by
--    scripts before apply. Going forward, editing a material's coverage in
--    Settings → Materials reprices every estimate automatically.
--
--    Catalog coverage at time of writing: Strata Mat=1, 254 Platinum=45,
--    253 Gold=65, Grout=100, Cement Board=15. Waste = coverage / old_divisor:
--      Platinum  0.90 / 45 = 1/50   Gold 1.30 / 65 = 1/50   Grout 2.0 / 100 = 1/50
--    (Kitchen grout used /60 → waste 100/60 = 1.6667.)
--
-- Scope: the five clean whole-floor templates. The Tub Surround + Bathroom
-- Floor combo and the optional outside floor in the walk-in shower / tub
-- surround templates are handled in a follow-up (they price the floor as a
-- fraction of total sqft, which needs its own before/after).

-- ── Addon: cement-board floor option (default OFF = Strata Mat) ──────────
-- Half Bathroom already declares walls_over_drywall; append the floor option.
UPDATE job_templates SET addons = '[
  {"key": "walls_over_drywall", "label": "Short walls: tile over existing drywall (no new backer board)", "hint": "Leave unchecked to install cement board / GoBoard backer on the walls first. The floor always gets Strata Mat regardless of this choice.", "default": false},
  {"key": "cement_board_floor", "label": "Floor: cement board install instead of Strata Mat", "hint": "Default is Strata Mat (254 Platinum under + 253 Gold over). Tick only if the customer specifically wants a cement-board floor.", "default": false}
]'::jsonb
WHERE template_name = 'Half Bathroom (Floor + Short Walls)';

-- The four single-sqft floor templates only need the floor option.
UPDATE job_templates SET addons = '[
  {"key": "cement_board_floor", "label": "Floor: cement board install instead of Strata Mat", "hint": "Default is Strata Mat (254 Platinum under + 253 Gold over). Tick only if the customer specifically wants a cement-board floor.", "default": false},
  {"key": "large_format", "label": "Large-format tile (12\"+ on the long side)", "hint": "Switches setting bed to Platinum (lower coverage, more bags).", "default": false}
]'::jsonb
WHERE template_name IN ('Bathroom Floor (Small)', 'Bathroom Floor (Medium)');

UPDATE job_templates SET addons = '[
  {"key": "cement_board_floor", "label": "Floor: cement board install instead of Strata Mat", "hint": "Default is Strata Mat (254 Platinum under + 253 Gold over). Tick only if the customer specifically wants a cement-board floor.", "default": false}
]'::jsonb
WHERE template_name IN ('Kitchen Floor (Small)', 'Kitchen Floor (Large)');

-- ── Coverage-based, addon-gated materials formulas ──────────────────────

-- Bathroom Floor (Small)
UPDATE job_templates SET materials_formula = '[
  {"item": "Strata Mat (Laticrete uncoupling membrane)", "formula": "ceil(sqft * 1.10 / coverage)", "min": 25, "max": 60, "applies_when": "!cement_board_floor"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft * 0.90 / coverage)", "min": 1, "max": 2, "applies_when": "!cement_board_floor"},
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sqft / coverage)", "min": 2, "max": 6, "applies_when": "cement_board_floor"},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft * 1.30 / coverage)", "min": 1, "max": 2},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft * 2.0 / coverage)", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "1", "min": 1, "max": 2}
]'::jsonb
WHERE template_name = 'Bathroom Floor (Small)';

-- Bathroom Floor (Medium)
UPDATE job_templates SET materials_formula = '[
  {"item": "Strata Mat (Laticrete uncoupling membrane)", "formula": "ceil(sqft * 1.10 / coverage)", "min": 50, "max": 120, "applies_when": "!cement_board_floor"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft * 0.90 / coverage)", "min": 2, "max": 4, "applies_when": "!cement_board_floor"},
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sqft / coverage)", "min": 4, "max": 10, "applies_when": "cement_board_floor"},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft * 1.30 / coverage)", "min": 2, "max": 4},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft * 2.0 / coverage)", "min": 1, "max": 3},
  {"item": "Caulking", "formula": "ceil(sqft / 40)", "min": 2, "max": 4}
]'::jsonb
WHERE template_name = 'Bathroom Floor (Medium)';

-- Kitchen Floor (Small)  (grout used /60 → waste 1.6667)
UPDATE job_templates SET materials_formula = '[
  {"item": "Strata Mat (Laticrete uncoupling membrane)", "formula": "ceil(sqft * 1.10 / coverage)", "min": 50, "max": 120, "applies_when": "!cement_board_floor"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft * 0.90 / coverage)", "min": 1, "max": 3, "applies_when": "!cement_board_floor"},
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sqft / coverage)", "min": 4, "max": 8, "applies_when": "cement_board_floor"},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft * 1.30 / coverage)", "min": 1, "max": 3},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft * 100 / 60 / coverage)", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "1", "min": 1, "max": 2}
]'::jsonb
WHERE template_name = 'Kitchen Floor (Small)';

-- Kitchen Floor (Large)
UPDATE job_templates SET materials_formula = '[
  {"item": "Strata Mat (Laticrete uncoupling membrane)", "formula": "ceil(sqft * 1.10 / coverage)", "min": 100, "max": 280, "applies_when": "!cement_board_floor"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft * 0.90 / coverage)", "min": 2, "max": 6, "applies_when": "!cement_board_floor"},
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sqft / coverage)", "min": 7, "max": 18, "applies_when": "cement_board_floor"},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft * 1.30 / coverage)", "min": 2, "max": 6},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft * 100 / 60 / coverage)", "min": 2, "max": 4},
  {"item": "Caulking", "formula": "ceil(sqft / 80)", "min": 1, "max": 3}
]'::jsonb
WHERE template_name = 'Kitchen Floor (Large)';

-- Half Bathroom (Floor + Short Walls) — floor keyed off sub_sqft.bathroom_floor,
-- walls off sub_sqft.short_walls. Two cement-board lines are possible (floor +
-- walls) when both options are chosen; that's correct — different areas.
UPDATE job_templates SET materials_formula = '[
  {"item": "Strata Mat (Laticrete uncoupling membrane)", "formula": "ceil(sub_sqft.bathroom_floor * 1.10 / coverage)", "min": 15, "max": 50, "applies_when": "!cement_board_floor"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sub_sqft.bathroom_floor * 0.90 / coverage)", "min": 1, "max": 2, "applies_when": "!cement_board_floor"},
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sub_sqft.bathroom_floor / coverage)", "min": 1, "max": 4, "applies_when": "cement_board_floor"},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft * 1.30 / coverage)", "min": 1, "max": 2},
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sub_sqft.short_walls / coverage)", "min": 0, "max": 4, "applies_when": "!walls_over_drywall"},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft * 2.0 / coverage)", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "ceil(sqft / 40)", "min": 1, "max": 2}
]'::jsonb
WHERE template_name = 'Half Bathroom (Floor + Short Walls)';
