-- Migration 023: Template sub-areas for projects that price by region.
--
-- Why: a walk-in shower has three areas that pull different materials —
-- the walls (GoBoard backer), the shower floor (no backer, just thinset
-- on a Schluter Kerdi tray), and optionally the bathroom floor outside
-- the shower (cement board). Pricing one "sqft" lumps them together and
-- mis-counts every material. After this migration the modal can ask for
-- separate sqft per area and the formulas (migration 024) reference each
-- one by name.
--
-- Backward compatibility: each sub-area entry carries an optional
-- `default_share` (0..1). When a legacy single-sqft caller (MCP tool,
-- tile-estimate skill, the old single-sqft API body) hits a template
-- with sub_areas, the engine splits the provided sqft proportionally
-- using those shares so existing code keeps producing reasonable
-- numbers without any client change.
--
-- Templates without sub_areas (the empty-array default) keep behaving
-- exactly as before — one sqft input, formulas reference `sqft`.

ALTER TABLE job_templates
  ADD COLUMN IF NOT EXISTS sub_areas JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN job_templates.sub_areas IS
  'Per-template sub-area definitions. Array of '
  '{key, label, hint?, default_share?}. The dashboard modal renders one '
  'input per entry; materials_formula references the values via '
  'sub_sqft.<key>. default_share splits a single sqft input across '
  'sub-areas for legacy callers that don''t supply sub_sqft.';

-- ── Walk-in Shower (Small) ──────────────────────────────────────────────
-- Typical 110 sqft walk-in: ~75 walls, ~16 shower floor, ~20 outside floor.
-- Default shares ≈ 0.70 / 0.15 / 0.15 — outside floor is opt-in but the
-- legacy fallback assumes a small bathroom floor came along for the ride.
UPDATE job_templates SET sub_areas = '[
  {"key": "walls", "label": "Wall sqft (GoBoard area)", "hint": "Tub-height to ceiling, 3 walls. Typical 60-90.", "default_share": 0.70},
  {"key": "shower_floor", "label": "Shower floor sqft", "hint": "Inside the shower curb. Typical 12-25.", "default_share": 0.15},
  {"key": "outside_floor", "label": "Bathroom floor sqft (optional)", "hint": "Floor outside the shower, if also being tiled.", "default_share": 0.15}
]'::jsonb
WHERE template_name = 'Walk-in Shower (Small)';

-- ── Walk-in Shower (Large) ──────────────────────────────────────────────
-- Bigger walls + bigger floor. ~120 walls, 25 shower floor, 30 outside.
UPDATE job_templates SET sub_areas = '[
  {"key": "walls", "label": "Wall sqft (GoBoard area)", "hint": "Tub-height to ceiling, 3 walls. Typical 100-140.", "default_share": 0.65},
  {"key": "shower_floor", "label": "Shower floor sqft", "hint": "Inside the shower curb. Typical 20-35.", "default_share": 0.15},
  {"key": "outside_floor", "label": "Bathroom floor sqft (optional)", "hint": "Floor outside the shower, if also being tiled.", "default_share": 0.20}
]'::jsonb
WHERE template_name = 'Walk-in Shower (Large)';

-- ── Standard Tub Surround ───────────────────────────────────────────────
-- Just the three walls around the tub. The "tub floor" is the tub itself,
-- so no shower-floor sub-area. Outside floor is optional add-on.
UPDATE job_templates SET sub_areas = '[
  {"key": "walls", "label": "Tub wall sqft (GoBoard area)", "hint": "3 walls around the tub, tub-rim to ~6 ft up. Typical 70-90.", "default_share": 0.85},
  {"key": "outside_floor", "label": "Bathroom floor sqft (optional)", "hint": "Only if floor is being tiled too.", "default_share": 0.15}
]'::jsonb
WHERE template_name = 'Standard Tub Surround';

-- ── Tub Surround + Bathroom Floor ───────────────────────────────────────
-- Combo template — both the tub walls AND the floor outside the tub.
UPDATE job_templates SET sub_areas = '[
  {"key": "walls", "label": "Tub wall sqft (GoBoard area)", "hint": "3 walls around the tub. Typical 65-85.", "default_share": 0.55},
  {"key": "floor", "label": "Bathroom floor sqft (cement board area)", "hint": "Whole bathroom floor. Typical 30-50.", "default_share": 0.45}
]'::jsonb
WHERE template_name = 'Tub Surround + Bathroom Floor';
