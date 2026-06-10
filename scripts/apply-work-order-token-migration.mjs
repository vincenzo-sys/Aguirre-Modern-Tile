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
// Migration 038 — idempotent, safe to re-run.
await c.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_order_token TEXT`)
await c.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_order_shared_at TIMESTAMPTZ`)
await c.query(
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_work_order_token
   ON jobs (work_order_token) WHERE work_order_token IS NOT NULL`
)
const r = await c.query(
  `SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'jobs' AND column_name IN ('work_order_token', 'work_order_shared_at')
   ORDER BY column_name`
)
console.log(r.rows.length === 2 ? `OK: ${JSON.stringify(r.rows)}` : `FAILED: got ${JSON.stringify(r.rows)}`)
await c.end()
