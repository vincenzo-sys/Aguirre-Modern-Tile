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

// 0. Confirm invoices schema
const cols = await c.query(
  `SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_schema='public' AND table_name='invoices'
   ORDER BY ordinal_position`
)
console.log('=== invoices columns ===')
for (const r of cols.rows) console.log(`${r.column_name} :: ${r.data_type} (nullable=${r.is_nullable})`)

const JOB_ID = 'a1252bdb-1567-47c0-94b8-274548f6d1d8'
const CUSTOMER_ID = 'aa681d52-fd4f-40d1-89fe-dee5440e3ac4'
const DUE_DATE = '2026-05-20'
const AMOUNT = 2500
const LINE_ITEMS = [
  {
    category: 'labor',
    description: 'Tile installation — final balance',
    quantity: 1,
    unit: 'job',
    unit_price: 2500,
    amount: 2500,
  },
]

// 1. Generate invoice number INV-YYYY-NNN (mirrors src/app/api/invoices/route.ts:83-90)
const year = new Date().getFullYear()
const countRes = await c.query(`SELECT COUNT(*)::int AS n FROM invoices`)
const num = String(countRes.rows[0].n + 1).padStart(3, '0')
const invoice_number = `INV-${year}-${num}`
console.log(`\n=== Proposed invoice ===`)
console.log({ invoice_number, job_id: JOB_ID, customer_id: CUSTOMER_ID, amount: AMOUNT, due_date: DUE_DATE, line_items: LINE_ITEMS })

if (process.argv.includes('--dry-run')) {
  console.log('\n(dry run — no insert)')
  await c.end()
  process.exit(0)
}

// 2. Insert as draft
const ins = await c.query(
  `INSERT INTO invoices (job_id, customer_id, invoice_number, amount, status, due_date, line_items)
   VALUES ($1, $2, $3, $4, 'draft', $5, $6::jsonb)
   RETURNING id, invoice_number, status, amount, due_date, created_at`,
  [JOB_ID, CUSTOMER_ID, invoice_number, AMOUNT, DUE_DATE, JSON.stringify(LINE_ITEMS)]
)
console.log('\n=== Inserted invoice ===')
console.log(JSON.stringify(ins.rows[0], null, 2))

// 3. Update jobs.amount_invoiced = sum of all invoices for this job
const sumRes = await c.query(
  `SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM invoices WHERE job_id = $1`,
  [JOB_ID]
)
const totalInvoiced = sumRes.rows[0].total
await c.query(`UPDATE jobs SET amount_invoiced = $1 WHERE id = $2`, [totalInvoiced, JOB_ID])
console.log(`\n=== Updated job amount_invoiced -> ${totalInvoiced} ===`)

await c.end()
