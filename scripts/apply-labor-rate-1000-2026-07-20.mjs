// Correct the to-customer labor rate to Aguirre's actual pricing: $1000/day
// for the 2-man crew, demo AND install (2026-07-20).
//
// The live labor_rates had install at $950/day (1.9× the $500/day crew cost)
// and demo at $800/day (1.6×) — both BELOW the standing convention of
// $1000/day = 100% markup on the $500 crew cost. Every estimate was
// under-charging labor (demo by $200/day, install by $50/day). Vince
// confirmed the rate is a flat $1000/day for both, since it's the same two
// guys on site regardless of demo vs install.
//
// Engine reads these two "... per Day (to customer)" values directly
// (scopes.ts); the Multiplier rows are documentation, updated here for
// consistency. Backs up labor_rates first; transactional.
//   node scripts/apply-labor-rate-1000-2026-07-20.mjs

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

// setting | new value | new note
const CHANGES = [
  ['Install Labor per Day (to customer)', 1000, '$250 x 2 guys x 2.0 (100% markup) = $1000/day'],
  ['Demo Labor per Day (to customer)', 1000, '$250 x 2 guys x 2.0 (100% markup) = $1000/day'],
  ['Install Multiplier', 2.0, 'Markup for install labor — $1000/day for 2 guys (100%)'],
  ['Demo Multiplier', 2.0, 'Markup for demo labor — $1000/day for 2 guys (100%)'],
]

const c = new pg.Client({ connectionString: process.env.DATABASE_URI })
await c.connect()
try {
  const { rows } = await c.query('SELECT setting, value, notes FROM labor_rates ORDER BY setting')
  await fs.writeFile(
    path.resolve('scripts/backups/labor_rates_2026-07-20.json'),
    JSON.stringify(rows, null, 2)
  )
  const bySetting = new Map(rows.map((r) => [r.setting, r]))

  await c.query('BEGIN')
  let applied = 0, missed = 0
  for (const [setting, value, note] of CHANGES) {
    const cur = bySetting.get(setting)
    if (!cur) { console.log(`MISS (no row): ${setting}`); missed++; continue }
    await c.query('UPDATE labor_rates SET value = $1, notes = $2 WHERE setting = $3', [value, note, setting])
    console.log(`~ ${setting.padEnd(38)} ${String(cur.value).padStart(7)} -> ${String(value).padStart(7)}`)
    applied++
  }
  await c.query('COMMIT')
  console.log(`\nCommitted ${applied} labor-rate changes. Missed: ${missed}.`)
  console.log('Backup: scripts/backups/labor_rates_2026-07-20.json')
} catch (err) {
  try { await c.query('ROLLBACK') } catch {}
  console.error('ROLLED BACK:', err.message)
  process.exitCode = 1
} finally {
  await c.end()
}
