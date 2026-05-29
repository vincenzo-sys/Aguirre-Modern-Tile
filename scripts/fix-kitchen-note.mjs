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
  `UPDATE job_templates
   SET notes = 'Open-concept kitchen. Customer provides tile, transitions, shoe molding. Strata Mat is standard substrate. Appliance moving by customer.'
   WHERE template_name = 'Kitchen Floor (Large)'`
)
console.log('Updated rows:', r.rowCount)
await c.end()
