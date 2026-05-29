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
const r = await c.query(
  `SELECT item, category, your_cost, price_to_customer, coverage, unit
   FROM materials_pricing
   WHERE item ILIKE '%strata%' OR item ILIKE '%ditra%' OR item ILIKE '%uncoupl%' OR category ILIKE '%backer%' OR category='Heating'
   ORDER BY category, item`
)
for (const row of r.rows) console.log(JSON.stringify(row))
await c.end()
