-- Migration 034: Walk-in Shower (Traditional Schluter) template.
--
-- Why: the existing Walk-in Shower templates (Small/Large) bundle the
-- pre-formed Schluter Kerdi-Tray + GoBoard waterproof walls — fast, clean,
-- and what we recommend by default. But high-end customers (or anyone
-- replacing an existing tiled shower with a non-stock floor footprint)
-- often ask for the traditional Schluter assembly instead:
--
--   • Cement board on walls (vs GoBoard)
--   • Kerdi waterproofing membrane over the cement board + over a mud-pack
--     pre-slope floor (vs GoBoard's integral waterproofing + pre-formed tray)
--   • Kerdi-Band at every change-of-plane (warranty requirement)
--   • Kerdi-Drain (drain stays the same as standard build)
--
-- The trade-off: ~+1 day of labor (overnight mud-pack cure) and a different
-- materials bill (Kerdi Membrane roll + Kerdi-Band rolls + Mapei deck-mud).
-- All three new materials were added to materials_pricing on 2026-05-14
-- using F&D retail prices as the cost basis:
--   - Schluter Kerdi Waterproofing Membrane (3ft x 215sf roll)  $459.95 / $551.94
--   - Schluter Kerdi-Band (5in x 32ft 10in roll)                 $43.70 /  $52.44
--   - Mapei 4-to-1 Mud Bed Mix (55 lb bag)                       $11.99 /  $14.39
--
-- Driver case: Teresa Budd, 477 E 4th St, South Boston — RFQ explicitly
-- specified cement board + Kerdi membrane + mud pack with center Kerdi drain.
-- See feedback_build_to_customer_spec memory for the rule that drives this:
-- when the customer hands over a detailed RFQ, build to THEIR spec.
--
-- Sub-area shares are tuned for the typical re-tile case (existing shower
-- footprint, no outside-floor reno). For combo jobs that add bathroom floor
-- tiling, the modal lets Vince override the outside_floor input directly.

-- ── Insert the new template ─────────────────────────────────────────────
INSERT INTO job_templates (
  template_name, job_type,
  base_price_low, base_price_high,
  typical_sqft_low, typical_sqft_high,
  demo_days, install_days,
  typical_materials, notes
) VALUES (
  'Walk-in Shower (Traditional Schluter)', 'Bathroom',
  5500, 7800,
  90, 140,
  1.0, 3.5,
  'Cement Board, Schluter Kerdi waterproofing membrane (215sf roll), Kerdi-Band seam tape (2 rolls), Mapei 4-to-1 deck mud (3-5 bags for pre-slope), Schluter Kerdi-Drain, 254 Platinum thinset (large-format walls), Grout, Caulking. Customer typically supplies tile + threshold; glass door is customer-supplied and customer-installed.',
  'Customer-specified traditional Schluter build (cement board walls + Kerdi membrane + mud-pack floor). Adds ~1 day vs the standard Walk-in Shower template for the mud-cure overnight window. Use when the RFQ explicitly calls for it, when integrating with an existing linear-drain or oversize/non-stock pan footprint that a pre-formed tray cannot match, or when the customer wants the traditional waterproofing build. Glass door customer-supplied, customer-installed. Plumbing scope (drain relocation, valve install) handled separately by Avery / All Things Plumbing referral.'
);

-- ── Sub-areas ───────────────────────────────────────────────────────────
-- Walls dominate (cement board), shower floor drives mud-pack qty, outside
-- floor is opt-in for combo bathroom-floor reno. Default shares match the
-- common re-tile scenario (~80% walls, ~15% shower floor, ~5% outside).
UPDATE job_templates SET sub_areas = '[
  {"key": "walls", "label": "Wall sqft (cement board area)", "hint": "Full-height walls + niche interior + step riser. Typical 75-110.", "default_share": 0.80},
  {"key": "shower_floor", "label": "Shower floor sqft (mud-pack)", "hint": "Inside the shower curb. Typical 12-25.", "default_share": 0.15},
  {"key": "outside_floor", "label": "Bathroom floor sqft (optional)", "hint": "Floor outside the shower, if also being tiled. Leave 0 for shower-only re-tiles.", "default_share": 0.05}
]'::jsonb
WHERE template_name = 'Walk-in Shower (Traditional Schluter)';

-- ── Addons ──────────────────────────────────────────────────────────────
-- large_format defaults to TRUE for this template — customers asking for the
-- traditional build are almost always pairing it with 24"+ porcelain or
-- stone slabs. has_curb defaults true (most builds have a curb).
-- No has_shower_tray toggle: the build by definition uses mud-pack + Kerdi
-- membrane, never a pre-formed tray.
UPDATE job_templates SET addons = '[
  {"key": "has_curb", "label": "Includes curb", "hint": "Most traditional shower builds have a 4-6 in framed curb. Uncheck for curbless.", "default": true},
  {"key": "large_format", "label": "Large-format tile (12 in+ on long side)", "hint": "Switches setting bed to 254 Platinum. Required bond strength for tile 12 in or larger. Default ON for this template — traditional builds usually pair with large-format / stone.", "default": true}
]'::jsonb
WHERE template_name = 'Walk-in Shower (Traditional Schluter)';

-- ── Materials formula ───────────────────────────────────────────────────
-- Cement board covers walls only (no GoBoard in this build). Membrane is
-- always 1 roll for jobs up to ~185sf coverage need (215sf roll with 15%
-- waste factor); kicks to 2 rolls only on the biggest jobs. Kerdi-Band
-- stays at 2 rolls baseline — bump in dashboard for showers with 3+ niches.
-- Mud-pack mix: ~3.5 sf coverage per 55-lb bag at 1.5" avg slope.
-- Drain unconditional (every build uses Kerdi-Drain). Curb conditional.
-- Thinset swaps Gold/Platinum on large_format. Platinum coverage drops to
-- ~35 sf/bag for large-format wall tile per Schluter spec.
UPDATE job_templates SET materials_formula = '[
  {"item": "Cement Board 1/2\" (3x5)", "formula": "ceil(sub_sqft.walls / 15)", "min": 6, "max": 14},
  {"item": "Schluter Kerdi Waterproofing Membrane (3ft x 215sf roll)", "formula": "ceil((sub_sqft.walls + sub_sqft.shower_floor) * 1.15 / 215)", "min": 1, "max": 2},
  {"item": "Schluter Kerdi-Band (5in x 32ft 10in roll)", "formula": "2", "min": 2, "max": 3},
  {"item": "Mapei 4-to-1 Mud Bed Mix (55 lb bag)", "formula": "ceil(sub_sqft.shower_floor / 3.5)", "min": 3, "max": 6},
  {"item": "Schluter Kerdi-Drain 4x4 ABS Stainless", "formula": "1", "min": 1, "max": 1},
  {"item": "Schluter Kerdi-Board Curb 48x6", "formula": "1", "min": 1, "max": 1, "applies_when": "has_curb"},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 50)", "min": 2, "max": 4, "applies_when": "!large_format"},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft / 35)", "min": 2, "max": 5, "applies_when": "large_format"},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 100)", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "2", "min": 2, "max": 4}
]'::jsonb
WHERE template_name = 'Walk-in Shower (Traditional Schluter)';
