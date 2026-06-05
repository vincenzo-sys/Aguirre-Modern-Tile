// Snapshot the current materials_pricing table to a timestamped JSON file
// BEFORE editing costs in Settings. There is no pricing audit history in the
// DB (only updated_at), so this file is the revert source if a cost is entered
// wrong. Read-only against the DB; the only write is the local JSON file.
//
//   node scripts/backup-materials-pricing.mjs
//
// Modeled on scripts/check-strata.mjs (reads .env.local, connects via pg).

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URI })
await c.connect()
const r = await c.query(`SELECT * FROM materials_pricing ORDER BY category, item`)
await c.end()

const stamp = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
const dir = path.resolve('scripts/backups')
await fs.mkdir(dir, { recursive: true })
const file = path.join(dir, `materials_pricing_${stamp}.json`)
await fs.writeFile(file, JSON.stringify(r.rows, null, 2), 'utf8')

console.log(`Backed up ${r.rows.length} materials_pricing rows → ${file}`)
