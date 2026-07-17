// Apply the 7 Lowe's/HD-only material prices (2026-07-17), search-sourced
// because lowes.com / homedepot.com return HTTP 403 to direct fetch. Vince
// approved "apply all 7 as found" and confirmed the GoBoard fastener SKU =
// the washer+screw combo (~$49.88). Kerdi-Drain kept at $149 (wide reseller
// spread; current value sits mid-range).
//
// Same behavior as the F&D pass: markup = max(existing, 0.20), price recomputed.
// Backup (all 37 rows, pre-change) already at scripts/backups/materials_pricing_2026-07-17.json.
//   node scripts/apply-material-prices-2026-07-17-lowes-hd.mjs

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const UPDATES = [
  { id: '9d624a50-d7f9-45c6-a87c-9b3ef12af133', name: 'GoBoard 1/2" (3x5)', cost: 29.98 },
  { id: 'daa942eb-170a-4b3c-9582-7161db115616', name: 'GoBoard 1/4" (3x5)', cost: 18.00 },
  { id: '776622a8-76ae-4a4d-851b-dce957f2dd10', name: 'GoBoard Caps & Screws (combo)', cost: 49.88 },
  { id: 'bc5d25af-e7a6-4764-b3a5-0cdb1e3c7d33', name: 'GoBoard Sealant', cost: 10.91 },
  { id: '92c8f391-25e8-4353-807c-1cf711cabae5', name: 'Ditra-Heat Peel & Stick', cost: 31.14 },
  { id: 'ce9dad9a-d7c0-46e2-831d-ae92fe8705ca', name: 'Ditra-Heat WiFi Thermostat', cost: 341.88 },
  { id: 'b451b0c6-f921-40ae-bf95-ab66125e605f', name: 'Kerdi-Drain 4x4 ABS Stainless', cost: 149.00 },
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
    if (rows.length === 0) { console.log(`SKIP (not found): ${u.name} [${u.id}]`); continue }
    const before = rows[0]
    const markup = Math.max(Number(before.markup_percent), 0.20)
    const newPrice = Math.round(u.cost * (1 + markup) * 100) / 100
    const moved = Number(before.your_cost) !== u.cost || Number(before.price_to_customer) !== newPrice
    await c.query(
      'UPDATE materials_pricing SET your_cost = $1, markup_percent = $2, price_to_customer = $3, updated_at = NOW() WHERE id = $4',
      [u.cost, markup, newPrice, u.id],
    )
    if (moved) changed++
    console.log(
      `${moved ? '~' : ' '} ${before.item}\n    cost  $${Number(before.your_cost).toFixed(2)} -> $${u.cost.toFixed(2)}` +
        `   price $${Number(before.price_to_customer).toFixed(2)} -> $${newPrice.toFixed(2)}   (markup ${(markup * 100).toFixed(0)}%)`,
    )
  }
  await c.query('COMMIT')
  console.log(`\nCommitted ${UPDATES.length} rows (${changed} changed). Catalog now fully verified 2026-07-17.`)
} catch (err) {
  await c.query('ROLLBACK')
  console.error('ROLLED BACK:', err.message)
  process.exitCode = 1
} finally {
  await c.end()
}
