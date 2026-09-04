-- Migration 056: Aguirre supplies the tile by default.
--
-- WHY
-- ---
-- materials_pricing has never contained a single tile SKU (39 rows on
-- 2026-08-24: Accessories, Backer Board, Grout, Heating, Other, Shower
-- Pan/Tray, Thinset — no Tile category). Every estimate the engine has ever
-- generated therefore quoted labour + setting materials and left the single
-- largest material spend on the job off the invoice entirely. The
-- `customer_provides: ['tile']` flag that the modal sent on every generate
-- was pure prose — it changed one line of scope-notes text and $0 of money.
--
-- The 7 jobs where Aguirre did supply tile were all hand-typed line items
-- (job #27 "FTL-1 floor tile — ALLOWANCE @ $5.00/SF cost" billed at $6.00/SF,
-- job #57 mosaic at $12/SF, job #62 "Tile" $128). That is the behaviour this
-- migration makes the default instead of the exception.
--
-- WHAT THIS DOES
-- --------------
--   1. Seeds three tile SKUs priced per sq ft at a 25% markup.
--   2. Appends two conditional tile entries to every template's
--      materials_formula, gated on the `supply_tile_standard` /
--      `supply_tile_large_format` flags that src/lib/estimator/scopes.ts
--      derives from `customer_provides` (see deriveTileFlags). Empty
--      customer_provides = we supply = tile line appears.
--   3. Rewrites the customer_provides_default prose on the templates and on
--      estimate_defaults so the estimate no longer tells the customer to buy
--      tile that we are now charging them for.
--
-- Grade selection reuses each template's existing `large_format` addon
-- rather than adding a checkbox: 12"+ tile genuinely costs more per sq ft,
-- and applies_when has no AND operator, so the conjunction
-- (we-supply AND large-format) is precomputed in the engine.
--
-- The Natural Stone / Designer SKU is seeded but deliberately NOT wired to a
-- formula — there is no third toggle to select it. It exists so the line item
-- can be swapped by hand on a stone job without inventing a price on the spot.
--
-- WASTE: 15% overage (`sqft * 1.15`) covers cuts and leaves attic stock for
-- future repairs. Straight-lay work only needs ~10%; herringbone/diagonal
-- wants 20%. 15% is the honest middle and matches how Aguirre already orders.
--
-- Idempotent: re-running inserts nothing and appends nothing.

-- ============================================================
-- 1. Tile SKUs
-- ============================================================
-- Cost basis (2026 pricing, Floor & Decor / local distributor):
--   Standard porcelain        builder-to-mid grade, 12x12–12x24 ...... $2.80/SF
--   Large format porcelain    12"+ on the long side, 24x48 slabs ..... $6.00/SF
--   Natural stone / designer  marble, hex, specialty mosaic .......... $12.00/SF
-- Markup 25%: above Aguirre's 20% default (job #27 precedent) and inside the
-- 25–35% band the trade uses for special-order tile, where the re-order and
-- return risk sits with the installer, not the customer.
INSERT INTO materials_pricing (item, category, your_cost, markup_percent, price_to_customer, coverage, unit, retail_link)
SELECT v.item, 'Tile', v.your_cost, 0.2500, v.price_to_customer, 1, 'sq ft', NULL
FROM (VALUES
  ('Tile - Standard Porcelain (supplied)',        2.80,  3.50),
  ('Tile - Large Format Porcelain (supplied)',    6.00,  7.50),
  ('Tile - Natural Stone / Designer (supplied)', 12.00, 15.00)
) AS v(item, your_cost, price_to_customer)
WHERE NOT EXISTS (
  SELECT 1 FROM materials_pricing m WHERE m.item = v.item
);

-- ============================================================
-- 2. Tile lines on every template
-- ============================================================
-- max = 4x the template's typical high sqft (floor of 100). A quantity that
-- large means the sqft was fat-fingered or the wrong template was picked;
-- the engine surfaces the clamp as a warning rather than silently ordering
-- $3,000 of tile.
-- The two entries differ only in item + applies_when, so they are driven from a
-- VALUES list rather than written out twice. That keeps the clamp expression
-- and the waste factor to one occurrence each: two copies of `sqft * 1.15` is
-- how the standard grade and the large-format grade end up ordering different
-- amounts of overage after someone edits one of them.
UPDATE job_templates t
SET materials_formula = COALESCE(t.materials_formula, '[]'::jsonb) || (
  SELECT jsonb_agg(
           jsonb_build_object(
             'item',         v.item,
             'formula',      'ceil(sqft * 1.15 / coverage)',
             'min',          1,
             'max',          GREATEST(100, CEIL(COALESCE(t.typical_sqft_high, 200) * 4)::int),
             'applies_when', v.applies_when
           )
           ORDER BY v.ord
         )
    FROM (VALUES
      (1, 'Tile - Standard Porcelain (supplied)',     'supply_tile_standard'),
      (2, 'Tile - Large Format Porcelain (supplied)', 'supply_tile_large_format')
    ) AS v(ord, item, applies_when)
)
WHERE NOT (COALESCE(t.materials_formula, '[]'::jsonb) @> '[{"applies_when": "supply_tile_standard"}]'::jsonb);

-- ============================================================
-- 3. Customer-facing prose
-- ============================================================
-- Every one of these strings used to open with "Tile, ..." in the customer's
-- column. Leaving them alone would ship an estimate that bills for tile in
-- the line items and tells the customer to go buy it two paragraphs later.

-- The promise itself — "we purchase and deliver it" — is the load-bearing
-- sentence: it is what stops the estimate billing for tile in the line items
-- and telling the customer to go buy it two paragraphs later. It was written
-- out eight times. Written once here, so it cannot be reworded in seven places
-- and missed in the eighth.
--
-- Only the lead noun and the per-template remainder vary. Shower Tray (Kerdi)
-- and estimate_defaults stay separate statements on purpose: the first leads
-- with "Floor tile selection" and puts its slope warning BEFORE the grout line,
-- and the second writes a different table and ends "preference," not
-- "preference." Folding those into the loop would change the prose.
DO $mig$
DECLARE
  promise    TEXT := ' - you choose it, we purchase and deliver it (priced as a line item).';
  lead_std   TEXT := 'Tile selection'       || promise;
  lead_floor TEXT := 'Floor tile selection' || promise;
BEGIN
  UPDATE job_templates t
     SET customer_provides_default = lead_std || ' ' || v.tail
    FROM (VALUES
      (ARRAY['Kitchen Floor (Small)', 'Kitchen Floor (Large)'],
       'Grout color preference. Transition strips, shoe molding, and appliance moving. Base shoe re-install handled by your carpenter. We do not disconnect gas or water lines.'),

      (ARRAY['Bathroom Floor (Small)', 'Bathroom Floor (Medium)', 'Tub Surround + Bathroom Floor', 'Half Bathroom (Floor + Short Walls)'],
       'Grout color preference. Plumbing fixtures (rough-in by your plumber). Toilet removal is included; reinstall handled by your plumber.'),

      (ARRAY['Standard Tub Surround', 'Walk-in Shower (Small)', 'Walk-in Shower (Large)', 'Walk-in Shower (Traditional Schluter)'],
       'Grout color preference. Glass shower door (we coordinate with your glass installer), niche shelf preference, and plumbing fixtures (rough-in done by your plumber).'),

      (ARRAY['Backsplash (Standard)', 'Backsplash (Large/Complex)'],
       'Grout color preference. We supply all installation materials (thinset, waterproofing, grout, caulking).'),

      (ARRAY['Fireplace Surround'],
       'Grout color preference. Confirm the material is rated for the heat exposure of your fireplace.'),

      (ARRAY['Shower Floor Only'],
       'Grout color preference. Note: demoing an existing shower floor may compromise the pan/waterproofing - discuss scope with us before scheduling.')
    ) AS v(template_names, tail)
   WHERE t.template_name = ANY(v.template_names);

  UPDATE job_templates SET customer_provides_default = lead_floor ||
    ' Mosaic is strongly recommended so it conforms to the tray slope; large-format tile will not lay flat on a sloped tray. Grout color preference. Plumbing work (drain relocation or waste pipe changes) is not included.'
  WHERE template_name = 'Shower Tray Replacement (Kerdi)';

  UPDATE estimate_defaults SET customer_provides_default = lead_std ||
    ' Grout color preference, plus any decorative or specialty features you want sourced separately.'
  WHERE id = 1;
END
$mig$;

-- ============================================================
-- Verification (run by hand after applying)
-- ============================================================
-- SELECT item, your_cost, price_to_customer, unit FROM materials_pricing WHERE category = 'Tile';
--   -> 3 rows
-- SELECT template_name,
--        jsonb_array_length(materials_formula) AS entries,
--        materials_formula @> '[{"applies_when": "supply_tile_standard"}]'::jsonb AS has_tile
--   FROM job_templates ORDER BY template_name;
--   -> has_tile = true on every row
-- SELECT template_name FROM job_templates WHERE customer_provides_default LIKE 'Tile,%';
--   -> 0 rows
