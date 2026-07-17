// Apply the 2026-07-17 material-price verification to materials_pricing.
//
// New costs = current Floor & Decor retail (fetched 2026-07-17). F&D is the
// only fetchable retailer of the three (Lowe's/Home Depot return HTTP 403);
// the 7 Lowe's/HD-only items are handled separately. Mirrors the Settings →
// Materials behavior on a Your-Cost edit:
//   markup_used = max(current markup_percent, 0.20)
//   price_to_customer = round(new_cost * (1 + markup_used), 2)
// (each item KEEPS its existing markup, floored at 20%.)
//
// Backup taken first: scripts/backups/materials_pricing_2026-07-17.json.
// Single transaction; prints before/after for every row.
//   node scripts/apply-material-prices-2026-07-17.mjs

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

// id, name (for logging), new your_cost = F&D-verified retail. Matched by id.
const UPDATES = [
  { id: '08b9ffef-7c03-4061-8577-6b3c71c010c9', name: 'Bright White Polished Corner Shelf', cost: 26.39 },
  { id: 'd7d94212-181c-46f0-b4b9-c264de3c7a86', name: 'Carrara Marble White Corner Shelf', cost: 34.99 },
  { id: 'eed1fc14-8a14-475d-a9aa-7966fd4d6164', name: 'Glass Corner Shelf', cost: 20.89 },
  { id: '530d0bb8-8515-45bc-b141-56f8b3bbe444', name: 'Metal Edge - Small', cost: 21.11 },
  { id: 'ecf1c32a-3f69-47f4-9c09-db061575e3b4', name: 'Kerdi-Board Bench 11.5x38', cost: 286.10 },
  { id: '8e7bf948-8d56-43e1-a25f-5cdaeba9b85d', name: 'Kerdi-Board Triangular Bench 16x16', cost: 177.49 },
  { id: '56af6ee0-43f1-44df-968c-746374095b3b', name: 'Cement Board 1/2" (3x5)', cost: 15.85 },
  { id: '2001d39f-5992-4311-b33e-0398e7ab0f6d', name: 'Strata Mat (per sq ft)', cost: 1.77 },
  { id: '6287c42c-23d0-4c08-b31f-4ca65b4a35ed', name: 'Caulking', cost: 16.99 },
  { id: '9382ae93-5903-4baa-afb8-87e629d8f0ac', name: 'Grout 25 lb (bag)', cost: 32.39 },
  { id: 'dae58a00-bb45-40e4-909f-9a3357316491', name: 'SpectraLock Part AB', cost: 101.00 },
  { id: 'e73416bc-4a72-4b82-bc02-1e96b259bb07', name: 'SpectraLock Part C', cost: 20.80 },
  { id: '2002c4fa-fb91-44de-8b45-9d3e09555481', name: 'Ditra-Heat 120V Cable', cost: 339.80 },
  { id: '491b0f4c-fbe0-4601-8f27-137145a3be7b', name: 'Ditra-Heat Membrane Sheet', cost: 24.90 },
  { id: '879965eb-96ba-43d6-9a20-4dea2d204a5f', name: 'Ditra-Heat Smart Thermostat', cost: 348.92 },
  { id: 'a1565254-ac23-48a6-87ff-84c8b7675902', name: 'Ditra-Heat-E-R Non-Programmable Thermostat', cost: 175.00 },
  { id: '44aa938a-3dd6-4ec0-befa-9594ad839ab6', name: 'NXT Level Plus Self Leveling', cost: 48.99 },
  { id: '7f1a7ef5-21ed-4b74-b3b4-fdf74f3945ee', name: 'Miracle 511 Impregnator Sealer', cost: 19.08 },
  { id: '7bdbb782-eff0-468a-825e-6c594a084a52', name: 'Kerdi Shower Tray 38x38 Center', cost: 117.23 },
  { id: '84138e9a-751d-428b-a83f-26a5b7701479', name: 'Kerdi Shower Tray 38x60 Off Center', cost: 141.30 },
  { id: 'd0c358ae-4b62-47bc-9dac-23e91387eabb', name: 'Kerdi Shower Tray 48x48 Center', cost: 129.27 },
  { id: '1c80543d-651f-4270-adce-ad7096ed7f14', name: 'Kerdi Shower Tray 48x72 Center', cost: 225.47 },
  { id: '2d41ac80-6e64-4dc0-bf8c-0c0b3f784f9f', name: 'Kerdi Shower Tray 72x72 Center', cost: 300.61 },
  { id: '63c492ec-cdf1-4fdd-97fd-92b29ab2ef86', name: 'Kerdi Waterproofing Membrane (215sf)', cost: 459.95 },
  { id: '4ce12fbf-ca48-46d0-b0a9-3b805e27988e', name: 'Kerdi-Band', cost: 43.70 },
  { id: 'e7275dcb-f516-4d89-a550-c160f3c7a9e7', name: 'Kerdi-Board Curb 48x6', cost: 70.07 },
  { id: '67a55c58-40fc-4ac4-bb4e-d6e358d0183a', name: 'Mapei 4-to-1 Mud Bed Mix', cost: 11.99 },
  { id: '600724fc-bec2-42f7-aa27-6c8278486408', name: 'Schluter ALL-SET Gray Thinset', cost: 38.73 },
  { id: '73ee19c3-f3f1-46fe-b54a-a5d669e615e1', name: 'Thinset - 253 Gold (50 lb)', cost: 24.89 },
  { id: 'b3f458ec-78f4-47ff-9800-50e61c81659a', name: 'Thinset - 254 Platinum (50 lb)', cost: 52.59 },
]

const c = new pg.Client({ connectionString: process.env.DATABASE_URI })
await c.connect()
let changed = 0
try {
  await c.query('BEGIN')
  for (const u of UPDATES) {
    const { rows } = await c.query(
      'SELECT item, your_cost, markup_percent, price_to_customer FROM materials_pricing WHERE id = $1',
      [u.id],
    )
    if (rows.length === 0) {
      console.log(`SKIP (not found): ${u.name} [${u.id}]`)
      continue
    }
    const before = rows[0]
    const markup = Math.max(Number(before.markup_percent), 0.20)
    const newPrice = Math.round(u.cost * (1 + markup) * 100) / 100
    const costMoved = Number(before.your_cost) !== u.cost
    const priceMoved = Number(before.price_to_customer) !== newPrice
    await c.query(
      'UPDATE materials_pricing SET your_cost = $1, markup_percent = $2, price_to_customer = $3, updated_at = NOW() WHERE id = $4',
      [u.cost, markup, newPrice, u.id],
    )
    if (costMoved || priceMoved) changed++
    console.log(
      `${(costMoved || priceMoved) ? '~' : ' '} ${before.item}\n    cost  $${Number(before.your_cost).toFixed(2)} -> $${u.cost.toFixed(2)}` +
        `   price $${Number(before.price_to_customer).toFixed(2)} -> $${newPrice.toFixed(2)}` +
        `   (markup ${(markup * 100).toFixed(0)}%)`,
    )
  }
  await c.query('COMMIT')
  console.log(`\nCommitted ${UPDATES.length} rows (${changed} with an actual change).`)
} catch (err) {
  await c.query('ROLLBACK')
  console.error('ROLLED BACK:', err.message)
  process.exitCode = 1
} finally {
  await c.end()
}
