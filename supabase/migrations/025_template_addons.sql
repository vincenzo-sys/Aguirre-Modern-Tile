-- Migration 025: Template addons + completed shower bills of material.
--
-- The walk-in shower templates were missing the actual shower system —
-- tray, drain, curb. Generating an estimate produced GoBoard + thinset
-- + grout and stopped there, so Vince was hand-adding $370 trays and
-- $179 drains on every quote. The lead workspace's $1,370 placeholder
-- on Vincenzo Degregorio is the canonical case: the auto-generated
-- estimate didn't include the system that actually makes a shower work.
--
-- Two additions:
--
--   1. An `addons` JSONB column on job_templates declaring which boolean
--      toggles each template surfaces in the modal (has_shower_tray,
--      has_curb, large_format). The modal renders one checkbox per entry,
--      sends the chosen flags as scope.addons.<key>, and the engine gates
--      each materials_formula entry on its `applies_when` predicate.
--
--   2. Conditional entries on materials_formula — tray + drain (when
--      has_shower_tray), curb (when has_curb), and a thinset swap
--      (Platinum for large-format tile, Gold otherwise). The
--      applies_when string is evaluated by the engine: a bare name
--      ("large_format") is true when that addon is truthy; a "!" prefix
--      ("!large_format") inverts. Empty / absent = always include.
--
-- Backward compat: addons defaults to []. Templates with no addons keep
-- behaving exactly as before. Legacy single-template / single-sqft
-- callers don't supply addons; their estimates won't include shower
-- systems unless they explicitly opt in (which is correct — a tub
-- surround request shouldn't ship with a Kerdi tray).

ALTER TABLE job_templates
  ADD COLUMN IF NOT EXISTS addons JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN job_templates.addons IS
  'Per-template boolean toggle definitions. Array of {key, label, hint?, '
  'default?}. Modal renders a checkbox per entry; scope.addons.<key> is '
  'sent in the payload. materials_formula entries gate inclusion via '
  'applies_when (e.g. "has_shower_tray", "!large_format"). Empty array '
  '= no addon UI for this template.';

-- ============================================================
-- Fix migration 023's `floor` sub-area key — `floor` collides with
-- expr-eval's Math.floor unary op so the formula `sub_sqft.floor` fails
-- to parse. Rename to `bathroom_floor` (no collision). Idempotent: only
-- rewrites entries where key = 'floor'.
-- ============================================================
UPDATE job_templates
SET sub_areas = (
  SELECT jsonb_agg(
    CASE WHEN entry->>'key' = 'floor'
      THEN jsonb_set(entry, '{key}', '"bathroom_floor"')
      ELSE entry
    END
  )
  FROM jsonb_array_elements(sub_areas) AS entry
)
WHERE template_name = 'Tub Surround + Bathroom Floor'
  AND sub_areas @> '[{"key": "floor"}]'::jsonb;

-- ============================================================
-- Addon definitions for walk-in shower templates
-- ============================================================

-- Walk-in Shower (Small): tray + curb + thinset choice
UPDATE job_templates SET addons = '[
  {"key": "has_shower_tray", "label": "Includes Schluter Kerdi shower tray + drain", "hint": "Default 48x72 Center ($271) — edit the line item if a different size fits better.", "default": true},
  {"key": "has_curb", "label": "Includes shower curb", "hint": "Walk-in showers usually have a curb unless it''s curbless.", "default": true},
  {"key": "large_format", "label": "Large-format tile (12\"+ on the long side)", "hint": "Switches setting bed to Thinset 254 Platinum. Costs more but mandatory for large-format.", "default": false}
]'::jsonb
WHERE template_name = 'Walk-in Shower (Small)';

-- Walk-in Shower (Large)
UPDATE job_templates SET addons = '[
  {"key": "has_shower_tray", "label": "Includes Schluter Kerdi shower tray + drain", "hint": "Default 72x72 Center ($370) — edit the line item if a different size fits better.", "default": true},
  {"key": "has_curb", "label": "Includes shower curb", "hint": "Walk-in showers usually have a curb unless it''s curbless.", "default": true},
  {"key": "large_format", "label": "Large-format tile (12\"+ on the long side)", "hint": "Switches setting bed to Thinset 254 Platinum.", "default": false}
]'::jsonb
WHERE template_name = 'Walk-in Shower (Large)';

-- Standard Tub Surround: large-format only (no tray/curb on tubs)
UPDATE job_templates SET addons = '[
  {"key": "large_format", "label": "Large-format tile (12\"+ on the long side)", "hint": "Switches wall thinset to Platinum.", "default": false}
]'::jsonb
WHERE template_name = 'Standard Tub Surround';

UPDATE job_templates SET addons = '[
  {"key": "large_format", "label": "Large-format tile (12\"+ on the long side)", "hint": "Switches setting bed to Platinum.", "default": false}
]'::jsonb
WHERE template_name = 'Tub Surround + Bathroom Floor';

UPDATE job_templates SET addons = '[
  {"key": "large_format", "label": "Large-format tile (12\"+ on the long side)", "hint": "Switches setting bed to Platinum (lower coverage, more bags).", "default": false}
]'::jsonb
WHERE template_name = 'Bathroom Floor (Small)';

UPDATE job_templates SET addons = '[
  {"key": "large_format", "label": "Large-format tile (12\"+ on the long side)", "hint": "Switches setting bed to Platinum (lower coverage, more bags).", "default": false}
]'::jsonb
WHERE template_name = 'Bathroom Floor (Medium)';

-- Backsplashes can also be large format (subway tile = standard, mosaic
-- + 12x24 stone = large)
UPDATE job_templates SET addons = '[
  {"key": "large_format", "label": "Large-format tile (12\"+ on the long side)", "hint": "Use for slabs / 12x24 stone backsplashes.", "default": false}
]'::jsonb
WHERE template_name IN ('Backsplash (Standard)', 'Backsplash (Large/Complex)', 'Fireplace Surround', 'Shower Floor Only');

-- ============================================================
-- Updated materials_formula with conditional entries
-- ============================================================

-- ── Walk-in Shower (Small) ──────────────────────────────────────────────
-- Bundles: tray (48x72 default) + drain + curb. Thinset swaps Gold/Platinum.
UPDATE job_templates SET materials_formula = '[
  {"item": "GoBoard 1/2\" (3x5)", "formula": "ceil(sub_sqft.walls / 12)", "min": 6, "max": 12},
  {"item": "GoBoard Sealant", "formula": "ceil(sub_sqft.walls / 35)", "min": 2, "max": 5},
  {"item": "GoBoard Caps & Screws", "formula": "ceil(sub_sqft.walls / 80)", "min": 1, "max": 3},
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sub_sqft.outside_floor / 15)", "min": 0, "max": 6},
  {"item": "Schluter Kerdi Shower Tray 48x72 Center", "formula": "1", "min": 1, "max": 1, "applies_when": "has_shower_tray"},
  {"item": "Schluter Kerdi-Drain 4x4 ABS Stainless", "formula": "1", "min": 1, "max": 1, "applies_when": "has_shower_tray"},
  {"item": "Schluter Kerdi-Board Curb 48x6", "formula": "1", "min": 1, "max": 1, "applies_when": "has_curb"},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 50)", "min": 2, "max": 4, "applies_when": "!large_format"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft / 35)", "min": 2, "max": 5, "applies_when": "large_format"},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 100)", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "2", "min": 2, "max": 4}
]'::jsonb
WHERE template_name = 'Walk-in Shower (Small)';

-- ── Walk-in Shower (Large) ──────────────────────────────────────────────
-- Defaults to the 72x72 tray.
UPDATE job_templates SET materials_formula = '[
  {"item": "GoBoard 1/2\" (3x5)", "formula": "ceil(sub_sqft.walls / 12)", "min": 10, "max": 18},
  {"item": "GoBoard Sealant", "formula": "ceil(sub_sqft.walls / 40)", "min": 3, "max": 6},
  {"item": "GoBoard Caps & Screws", "formula": "ceil(sub_sqft.walls / 80)", "min": 2, "max": 4},
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sub_sqft.outside_floor / 15)", "min": 0, "max": 8},
  {"item": "Schluter Kerdi Shower Tray 72x72 Center", "formula": "1", "min": 1, "max": 1, "applies_when": "has_shower_tray"},
  {"item": "Schluter Kerdi-Drain 4x4 ABS Stainless", "formula": "1", "min": 1, "max": 1, "applies_when": "has_shower_tray"},
  {"item": "Schluter Kerdi-Board Curb 48x6", "formula": "1", "min": 1, "max": 1, "applies_when": "has_curb"},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 55)", "min": 3, "max": 5, "applies_when": "!large_format"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft / 38)", "min": 3, "max": 6, "applies_when": "large_format"},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 100)", "min": 1, "max": 3},
  {"item": "Caulking", "formula": "ceil(sqft / 60)", "min": 3, "max": 5}
]'::jsonb
WHERE template_name = 'Walk-in Shower (Large)';

-- ── Standard Tub Surround (large-format thinset swap) ───────────────────
UPDATE job_templates SET materials_formula = '[
  {"item": "GoBoard 1/2\" (3x5)", "formula": "ceil(sub_sqft.walls / 15)", "min": 5, "max": 10},
  {"item": "GoBoard Sealant", "formula": "ceil(sub_sqft.walls / 40)", "min": 2, "max": 4},
  {"item": "GoBoard Caps & Screws", "formula": "1", "min": 1, "max": 2},
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sub_sqft.outside_floor / 15)", "min": 0, "max": 5},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 40)", "min": 2, "max": 4, "applies_when": "!large_format"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft / 28)", "min": 2, "max": 5, "applies_when": "large_format"},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "2", "min": 2, "max": 3}
]'::jsonb
WHERE template_name = 'Standard Tub Surround';

-- ── Tub Surround + Bathroom Floor ───────────────────────────────────────
UPDATE job_templates SET materials_formula = '[
  {"item": "GoBoard 1/2\" (3x5)", "formula": "ceil(sub_sqft.walls / 15)", "min": 4, "max": 10},
  {"item": "GoBoard Sealant", "formula": "ceil(sub_sqft.walls / 35)", "min": 2, "max": 5},
  {"item": "GoBoard Caps & Screws", "formula": "1", "min": 1, "max": 2},
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sub_sqft.bathroom_floor / 15)", "min": 2, "max": 6},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 35)", "min": 3, "max": 5, "applies_when": "!large_format"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft / 25)", "min": 3, "max": 6, "applies_when": "large_format"},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 2, "max": 3},
  {"item": "Caulking", "formula": "2", "min": 2, "max": 4}
]'::jsonb
WHERE template_name = 'Tub Surround + Bathroom Floor';

-- ── Bathroom floors ─────────────────────────────────────────────────────
UPDATE job_templates SET materials_formula = '[
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sqft / 15)", "min": 2, "max": 6},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 50)", "min": 1, "max": 3, "applies_when": "!large_format"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft / 35)", "min": 1, "max": 4, "applies_when": "large_format"},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "1", "min": 1, "max": 2}
]'::jsonb
WHERE template_name = 'Bathroom Floor (Small)';

UPDATE job_templates SET materials_formula = '[
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sqft / 15)", "min": 4, "max": 10},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 40)", "min": 2, "max": 4, "applies_when": "!large_format"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft / 28)", "min": 2, "max": 5, "applies_when": "large_format"},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 1, "max": 3},
  {"item": "Caulking", "formula": "ceil(sqft / 40)", "min": 2, "max": 4}
]'::jsonb
WHERE template_name = 'Bathroom Floor (Medium)';

-- ── Backsplashes / Fireplace / Shower Floor Only ────────────────────────
UPDATE job_templates SET materials_formula = '[
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 60)", "min": 1, "max": 4, "applies_when": "!large_format"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft / 40)", "min": 1, "max": 5, "applies_when": "large_format"},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 1, "max": 3},
  {"item": "Caulking", "formula": "ceil(sqft / 30)", "min": 1, "max": 4}
]'::jsonb
WHERE template_name = 'Backsplash (Standard)';

UPDATE job_templates SET materials_formula = '[
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 60)", "min": 1, "max": 5, "applies_when": "!large_format"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft / 40)", "min": 1, "max": 6, "applies_when": "large_format"},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 1, "max": 3},
  {"item": "Caulking", "formula": "ceil(sqft / 25)", "min": 2, "max": 5}
]'::jsonb
WHERE template_name = 'Backsplash (Large/Complex)';

UPDATE job_templates SET materials_formula = '[
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sqft / 15)", "min": 2, "max": 5},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 50)", "min": 1, "max": 2, "applies_when": "!large_format"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft / 35)", "min": 1, "max": 3, "applies_when": "large_format"},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 1, "max": 2}
]'::jsonb
WHERE template_name = 'Fireplace Surround';

UPDATE job_templates SET materials_formula = '[
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 50)", "min": 1, "max": 2, "applies_when": "!large_format"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft / 35)", "min": 1, "max": 3, "applies_when": "large_format"},
  {"item": "Grout 25 lb (bag)", "formula": "1", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "1", "min": 1, "max": 2}
]'::jsonb
WHERE template_name = 'Shower Floor Only';
