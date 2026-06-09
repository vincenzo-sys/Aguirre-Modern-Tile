// Apply the 2026-06 material-cost review to materials_pricing.
//
// Mirrors the Settings → Materials UI behavior on a Your-Cost edit:
//   markup_used = max(current markup_percent, 0.20)
//   price_to_customer = round(new_cost * (1 + markup_used), 2)
//   markup_percent set to markup_used
// (i.e. each item KEEPS its existing markup, floored at 20%.)
//
// New costs = highest verified retail price found across Floor & Decor /
// Lowe's / Home Depot (see chat review). Backup taken first:
// scripts/backups/materials_pricing_2026-06-05.json — revert source.
//
// Runs in a single transaction and prints before/after for every row.
//   node scripts/apply-material-cost-updates.mjs

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

// id, name (for logging), new your_cost. Matched by id so a name change can't
// hit the wrong row. 15 increases + 2 decreases (thermostats now priced above
// the verified highest retail — bring them down to the convention).
const UPDATES = [
  // --- increases ---
  { id: '73ee19c3-f3f1-46fe-b54a-a5d669e615e1', name: 'Thinset - 253 Gold (50 lb)', cost: 24.89 },
  { id: 'b3f458ec-78f4-47ff-9800-50e61c81659a', name: 'Thinset - 254 Platinum (50 lb)', cost: 52.59 },
  { id: '56af6ee0-43f1-44df-968c-746374095b3b', name: 'Cement Board 1/2" (3x5)', cost: 15.85 },
  { id: '2001d39f-5992-4311-b33e-0398e7ab0f6d', name: 'Strata Mat (per sq ft)', cost: 1.77 },
  { id: '6287c42c-23d0-4c08-b31f-4ca65b4a35ed', name: 'Caulking (Latasil)', cost: 16.99 },
  { id: '9382ae93-5903-4baa-afb8-87e629d8f0ac', name: 'Grout 25 lb (PermaColor)', cost: 32.39 },
  { id: 'bc5d25af-e7a6-4764-b3a5-0cdb1e3c7d33', name: 'GoBoard Sealant', cost: 12.98 },
  { id: '491b0f4c-fbe0-4601-8f27-137145a3be7b', name: 'Ditra-Heat Membrane Sheet', cost: 26.41 },
  { id: '7bdbb782-eff0-468a-825e-6c594a084a52', name: 'Kerdi Shower Tray 38x38 Center', cost: 124.34 },
  { id: '1c80543d-651f-4270-adce-ad7096ed7f14', name: 'Kerdi Shower Tray 48x72 Center', cost: 239.14 },
  { id: '2d41ac80-6e64-4dc0-bf8c-0c0b3f784f9f', name: 'Kerdi Shower Tray 72x72 Center', cost: 318.86 },
  { id: '63c492ec-cdf1-4fdd-97fd-92b29ab2ef86', name: 'Kerdi Waterproofing Membrane (215sf)', cost: 487.87 },
  { id: 'e7275dcb-f516-4d89-a550-c160f3c7a9e7', name: 'Kerdi-Board Curb 48x6', cost: 74.31 },
  { id: '08b9ffef-7c03-4061-8577-6b3c71c010c9', name: 'Bright White Polished Corner Shelf', cost: 26.39 },
  { id: 'eed1fc14-8a14-475d-a9aa-7966fd4d6164', name: 'Glass Corner Shelf', cost: 20.89 },
  // --- decreases (current cost was above verified highest retail) ---
  { id: '879965eb-96ba-43d6-9a20-4dea2d204a5f', name: 'Ditra-Heat Smart Thermostat (E-RS1)', cost: 370.09 },
  { id: 'ce9dad9a-d7c0-46e2-831d-ae92fe8705ca', name: 'Ditra-Heat WiFi Thermostat', cost: 366.89 },
]

const c = new pg.Client({ connectionString: process.env.DATABASE_URI })
await c.connect()
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
    await c.query(
      'UPDATE materials_pricing SET your_cost = $1, markup_percent = $2, price_to_customer = $3, updated_at = NOW() WHERE id = $4',
      [u.cost, markup, newPrice, u.id],
    )
    console.log(
      `${before.item}\n  cost  $${Number(before.your_cost).toFixed(2)} -> $${u.cost.toFixed(2)}` +
        `   price $${Number(before.price_to_customer).toFixed(2)} -> $${newPrice.toFixed(2)}` +
        `   (markup ${(markup * 100).toFixed(0)}%)`,
    )
  }
  await c.query('COMMIT')
  console.log(`\nCommitted ${UPDATES.length} updates.`)
} catch (err) {
  await c.query('ROLLBACK')
  console.error('ROLLED BACK:', err.message)
  process.exitCode = 1
} finally {
  await c.end()
}
