-- Migration 031: Floor installs use two thinsets — Platinum under, Gold over.
--
-- Correction from Vince 2026-05-01: every floor install that uses Strata Mat
-- requires TWO thinset line items:
--   1. Laticrete 254 Platinum  — bonds Strata Mat to plywood subfloor
--   2. Laticrete 253 Gold      — bonds tile to Strata Mat
--
-- Migration 030 only specced Gold; this corrects it. Each thinset bag covers
-- ~50 sqft, so for a 100 sqft floor we need 2 bags Platinum + 2 bags Gold.
--
-- Exception: floors INSIDE showers (Shower Floor Only, the floor portion of
-- Walk-in Shower templates). Those use the Schluter waterproofing system —
-- not Strata Mat — so the dual-thinset rule doesn't apply.
--
-- Affected templates:
--   ✓ Bathroom Floor (Small)
--   ✓ Bathroom Floor (Medium)
--   ✓ Kitchen Floor (Small)
--   ✓ Kitchen Floor (Large)
--   ✓ Tub Surround + Bathroom Floor (floor portion only — walls stay Gold)
--   ✗ Walk-in Shower (Small/Large) — shower waterproofing, not Strata Mat
--   ✗ Shower Floor Only — pan/waterproofing, not Strata Mat
--
-- Bonus cleanup: also fix the materials_pricing.retail_link for "Thinset - 254
-- Platinum (50 lb)" — the prior URL 404s. Verified-good replacement found
-- 2026-05-01 by URL audit + WebFetch.

-- ── 1. Floor template formulas — add Platinum to underside ──────────────

UPDATE job_templates SET materials_formula = '[
  {"item": "Strata Mat (Laticrete uncoupling membrane)", "formula": "ceil(sqft * 1.10)", "min": 25, "max": 60},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft / 50)", "min": 1, "max": 2},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 50)", "min": 1, "max": 2},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "1", "min": 1, "max": 2}
]'::jsonb
WHERE template_name = 'Bathroom Floor (Small)';

UPDATE job_templates SET materials_formula = '[
  {"item": "Strata Mat (Laticrete uncoupling membrane)", "formula": "ceil(sqft * 1.10)", "min": 50, "max": 120},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft / 50)", "min": 2, "max": 4},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 50)", "min": 2, "max": 4},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 1, "max": 3},
  {"item": "Caulking", "formula": "ceil(sqft / 40)", "min": 2, "max": 4}
]'::jsonb
WHERE template_name = 'Bathroom Floor (Medium)';

UPDATE job_templates SET materials_formula = '[
  {"item": "Strata Mat (Laticrete uncoupling membrane)", "formula": "ceil(sqft * 1.10)", "min": 50, "max": 120},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft / 50)", "min": 1, "max": 3},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 50)", "min": 1, "max": 3},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 60)", "min": 1, "max": 2},
  {"item": "Caulking", "formula": "1", "min": 1, "max": 2}
]'::jsonb
WHERE template_name = 'Kitchen Floor (Small)';

UPDATE job_templates SET materials_formula = '[
  {"item": "Strata Mat (Laticrete uncoupling membrane)", "formula": "ceil(sqft * 1.10)", "min": 100, "max": 280},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft / 50)", "min": 2, "max": 6},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 50)", "min": 2, "max": 6},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 60)", "min": 2, "max": 4},
  {"item": "Caulking", "formula": "ceil(sqft / 80)", "min": 1, "max": 3}
]'::jsonb
WHERE template_name = 'Kitchen Floor (Large)';

-- Tub Surround + Bathroom Floor — walls stay Gold-only (over GoBoard);
-- floor portion gets the Platinum-under treatment. Floor is 45% of total
-- sqft, so Platinum bag count derives from that fraction.
UPDATE job_templates SET materials_formula = '[
  {"item": "GoBoard 1/2\" (3x5)", "formula": "ceil(sqft * 0.55 / 15)", "min": 5, "max": 10},
  {"item": "GoBoard Sealant", "formula": "ceil(sqft * 0.55 / 30)", "min": 3, "max": 5},
  {"item": "GoBoard Caps & Screws", "formula": "1", "min": 1, "max": 2},
  {"item": "Strata Mat (Laticrete uncoupling membrane)", "formula": "ceil(sqft * 0.45 * 1.10)", "min": 25, "max": 80},
  {"item": "Thinset - 254 Platinum (50 lb)", "formula": "ceil(sqft * 0.45 / 50)", "min": 1, "max": 3},
  {"item": "Thinset - 253 Gold (50 lb)", "formula": "ceil(sqft / 35)", "min": 3, "max": 5},
  {"item": "Grout 25 lb (bag)", "formula": "ceil(sqft / 50)", "min": 2, "max": 3},
  {"item": "Caulking", "formula": "2", "min": 2, "max": 4}
]'::jsonb
WHERE template_name = 'Tub Surround + Bathroom Floor';

-- ── 2. Update typical_materials prose to call out both thinsets ─────────

UPDATE job_templates SET typical_materials =
  'Strata Mat (Laticrete uncoupling membrane), 254 Platinum thinset (1 bag, under Strata Mat), 253 Gold thinset (1 bag, tile to membrane), grout (1 bag), caulking. Cement board substituted on the rare bouncy / level-up subfloor.'
WHERE template_name = 'Bathroom Floor (Small)';

UPDATE job_templates SET typical_materials =
  'Strata Mat (Laticrete uncoupling membrane), 254 Platinum thinset (2 bags, under), 253 Gold thinset (2 bags, top), grout (1 bag), caulking. Cement board substituted on the rare bouncy / level-up subfloor.'
WHERE template_name = 'Bathroom Floor (Medium)';

UPDATE job_templates SET typical_materials =
  'Strata Mat (Laticrete uncoupling membrane), 254 Platinum thinset (2 bags, under Strata Mat), 253 Gold thinset (2 bags, tile to membrane), grout (1 bag), caulking, transition strips. Customer provides tile.'
WHERE template_name = 'Kitchen Floor (Small)';

UPDATE job_templates SET typical_materials =
  'Strata Mat (Laticrete uncoupling membrane), 254 Platinum thinset (3-5 bags, under), 253 Gold thinset (3-5 bags, top), grout (1-2 bags), caulking, transition strips. Customer provides tile.'
WHERE template_name = 'Kitchen Floor (Large)';

UPDATE job_templates SET typical_materials =
  'GoBoard (6 sheets) for walls, Strata Mat for floor portion, 254 Platinum thinset (under Strata Mat), 253 Gold thinset (walls + tile-to-membrane), grout (1 bag), caulking, GoBoard sealant'
WHERE template_name = 'Tub Surround + Bathroom Floor';

-- ── 3. Repair the broken Floor & Decor link for Thinset 254 Platinum ────
-- The old URL pointed at "254 Platinum Plus" SKU 101066629 which 404s.
-- The standard "254 Platinum" (the product Vince actually uses) is at
-- SKU 100898345 and 200's cleanly. Verified 2026-05-01.
UPDATE materials_pricing
SET retail_link = 'https://www.flooranddecor.com/laticrete-254-platinum-white-100898345.html'
WHERE item = 'Thinset - 254 Platinum (50 lb)';

-- ── 4. Backfill the Strata Mat retail_link with the verified F&D URL ────
UPDATE materials_pricing
SET retail_link = 'https://www.flooranddecor.com/laticrete-installation-materials/laticrete-strata-mat-150sqft.-100898311.html'
WHERE item = 'Strata Mat (Laticrete uncoupling membrane)';
