-- Migration 024: Update materials_formula for sub-area templates so each
-- material scales with the sub-area it actually consumes.
--
-- Before this migration:
--   GoBoard formula = ceil(sqft / 12)  — used "total sqft" which conflated
--   walls, shower floor, and outside floor. A 110-sqft walk-in produced
--   the same GoBoard count regardless of whether it was 80 sqft of walls
--   + 30 sqft of outside floor (correct: ~7 sheets) or 16 sqft of walls
--   + 94 sqft of outside floor (correct: ~2 sheets). The new formula
--   pulls only the wall sub-area, which is what GoBoard actually covers.
--
-- The engine still exposes `sqft` as the sum of sub_sqft values, so any
-- material that's truly project-wide (caulking near the cap, total
-- thinset/grout estimate) can keep referencing `sqft` and gets the same
-- answer it always did.
--
-- Compatibility: when a legacy caller hits these templates with just
-- `sqft`, the engine splits sqft into sub_sqft.X using each sub-area's
-- default_share (migration 023). So `sub_sqft.walls` is always populated,
-- whether the modal sent it directly or the engine derived it.

-- ── Walk-in Shower (Small) ──────────────────────────────────────────────
-- GoBoard wraps walls only. Shower floor goes into a Kerdi tray (separate
-- catalog item, added manually for showers that need one). Outside floor
-- (if any) gets cement board, not GoBoard.
UPDATE job_templates SET materials_formula = '[
  {"item": "GoBoard 1/2\" (3x5)", "formula": "ceil(sub_sqft.walls / 12)", "min": 6, "max": 12},
  {"item": "GoBoard Sealant", "formula": "ceil(sub_sqft.walls / 35)", "min": 2, "max": 5},
  {"item": "GoBoard Caps & Screws", "formula": "ceil(sub_sqft.walls / 80)", "min": 1, "max": 3},
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sub_sqft.outside_floor / 15)", "min": 0, "max": 6},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 50)", "min": 2, "max": 4},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 100)", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "2", "min": 2, "max": 4}
]'::jsonb
WHERE template_name = 'Walk-in Shower (Small)';

-- ── Walk-in Shower (Large) ──────────────────────────────────────────────
UPDATE job_templates SET materials_formula = '[
  {"item": "GoBoard 1/2\" (3x5)", "formula": "ceil(sub_sqft.walls / 12)", "min": 10, "max": 18},
  {"item": "GoBoard Sealant", "formula": "ceil(sub_sqft.walls / 40)", "min": 3, "max": 6},
  {"item": "GoBoard Caps & Screws", "formula": "ceil(sub_sqft.walls / 80)", "min": 2, "max": 4},
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sub_sqft.outside_floor / 15)", "min": 0, "max": 8},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 55)", "min": 3, "max": 5},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 100)", "min": 1, "max": 3},
  {"item": "Caulking", "formula": "ceil(sqft / 60)", "min": 3, "max": 5}
]'::jsonb
WHERE template_name = 'Walk-in Shower (Large)';

-- ── Standard Tub Surround ───────────────────────────────────────────────
-- Walls only by default. If outside_floor > 0, add cement board for it.
UPDATE job_templates SET materials_formula = '[
  {"item": "GoBoard 1/2\" (3x5)", "formula": "ceil(sub_sqft.walls / 15)", "min": 5, "max": 10},
  {"item": "GoBoard Sealant", "formula": "ceil(sub_sqft.walls / 40)", "min": 2, "max": 4},
  {"item": "GoBoard Caps & Screws", "formula": "1", "min": 1, "max": 2},
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sub_sqft.outside_floor / 15)", "min": 0, "max": 5},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 40)", "min": 2, "max": 4},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "2", "min": 2, "max": 3}
]'::jsonb
WHERE template_name = 'Standard Tub Surround';

-- ── Tub Surround + Bathroom Floor ───────────────────────────────────────
-- Walls use GoBoard, floor uses cement board — explicitly split now.
UPDATE job_templates SET materials_formula = '[
  {"item": "GoBoard 1/2\" (3x5)", "formula": "ceil(sub_sqft.walls / 15)", "min": 4, "max": 10},
  {"item": "GoBoard Sealant", "formula": "ceil(sub_sqft.walls / 35)", "min": 2, "max": 5},
  {"item": "GoBoard Caps & Screws", "formula": "1", "min": 1, "max": 2},
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sub_sqft.floor / 15)", "min": 2, "max": 6},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 35)", "min": 3, "max": 5},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 2, "max": 3},
  {"item": "Caulking", "formula": "2", "min": 2, "max": 4}
]'::jsonb
WHERE template_name = 'Tub Surround + Bathroom Floor';
