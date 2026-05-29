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
const { rows } = await c.query(
  `SELECT id, job_number, title, status, scheduled_start, scheduled_end,
          estimated_days, actual_days, estimated_cost, amount_paid,
          estimate_accepted_at, client_name
   FROM jobs
   WHERE id = '68005483-95fe-4531-8024-46134e63f3d4' OR client_name ILIKE 'Bill%'`
)
for (const r of rows) {
  console.log(JSON.stringify(r, null, 2))
}
await c.end()
