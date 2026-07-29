// Read-only: report whether migrations 045 (payment channels) and 046
// (inbox read-state) have been applied to the database in DATABASE_URI.
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

const cols = await c.query(
  `SELECT table_name, column_name FROM information_schema.columns
   WHERE (table_name = 'jobs' AND column_name = 'deposit_paid')
      OR (table_name IN ('message_log', 'call_log') AND column_name = 'read_at')
   ORDER BY table_name`
)
const tables = await c.query(
  `SELECT table_name FROM information_schema.tables WHERE table_name = 'processed_deposit_sessions'`
)
const fns = await c.query(
  `SELECT proname FROM pg_proc WHERE proname IN ('record_deposit', 'increment_job_final_payment')`
)
const idx = await c.query(
  `SELECT indexname FROM pg_indexes
   WHERE indexname IN ('message_log_unread_idx', 'call_log_unread_idx', 'idx_message_log_phone')`
)

const has045 =
  cols.rows.some((r) => r.column_name === 'deposit_paid') &&
  tables.rows.length === 1 &&
  fns.rows.length === 2
const has046 =
  cols.rows.filter((r) => r.column_name === 'read_at').length === 2 && idx.rows.length === 3

console.log('045 payment channels :', has045 ? 'APPLIED' : 'MISSING')
console.log('046 inbox read-state :', has046 ? 'APPLIED' : 'MISSING')
console.log('detail:', JSON.stringify({ cols: cols.rows, tables: tables.rows.length, fns: fns.rows.length, idx: idx.rows.length }))
await c.end()
