// Fix one misleading display-coverage value in materials_pricing (2026-07-17).
//
// Mapei 4-to-1 Mud Bed Mix had coverage = 0.5, which reads as "0.5 sq ft/bag"
// and is wrong. The actual per-bag yield used by the estimator is HARDCODED in
// the walk-in-shower template formula: ceil(sub_sqft.shower_floor / 3.5)
// ("~3.5 sf per 55-lb bag at 1.5in avg slope"). The catalog `coverage` value is
// NOT read for this item, so this update only corrects the Settings display —
// it does NOT change any estimate. Aligning it to 3.5 makes the shown number
// honest.
//
// Backup: scripts/backups/materials_pricing_2026-07-17.json.
//   node scripts/apply-material-coverage-2026-07-17.mjs

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const UPDATES = [
  { id: '67a55c58-40fc-4ac4-bb4e-d6e358d0183a', name: 'Mapei 4-to-1 Mud Bed Mix', coverage: 3.5 },
]

const c = new pg.Client({ connectionString: process.env.DATABASE_URI })
await c.connect()
try {
  await c.query('BEGIN')
  for (const u of UPDATES) {
    const { rows } = await c.query('SELECT item, coverage FROM materials_pricing WHERE id = $1', [u.id])
    if (rows.length === 0) { console.log(`SKIP (not found): ${u.name}`); continue }
    await c.query('UPDATE materials_pricing SET coverage = $1, updated_at = NOW() WHERE id = $2', [u.coverage, u.id])
    console.log(`${rows[0].item}\n  coverage ${Number(rows[0].coverage)} -> ${u.coverage} (display only — formula hardcodes /3.5)`)
  }
  await c.query('COMMIT')
  console.log('\nCommitted.')
} catch (err) {
  await c.query('ROLLBACK')
  console.error('ROLLED BACK:', err.message)
  process.exitCode = 1
} finally {
  await c.end()
}
