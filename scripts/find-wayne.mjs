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

console.log('=== Customers matching Wayne ===')
const customers = await c.query(
  `SELECT id, name, email, phone, address, city, state, source, created_at
   FROM customers
   WHERE name ILIKE '%wayne%' OR email ILIKE '%wayne%'
   ORDER BY created_at DESC`
)
for (const r of customers.rows) console.log(JSON.stringify(r, null, 2))

console.log('\n=== Jobs for Wayne (by customer_id or client_name) ===')
const customerIds = customers.rows.map(r => r.id)
const jobs = await c.query(
  `SELECT id, job_number, title, status, customer_id, client_name, client_phone,
          client_address, estimated_cost, amount_invoiced, amount_paid,
          scheduled_start, scheduled_end, created_at
   FROM jobs
   WHERE ($1::uuid[] IS NOT NULL AND customer_id = ANY($1::uuid[]))
      OR client_name ILIKE '%wayne%'
   ORDER BY created_at DESC`,
  [customerIds.length ? customerIds : null]
)
for (const r of jobs.rows) console.log(JSON.stringify(r, null, 2))

console.log('\n=== Existing invoices for Wayne jobs ===')
const jobIds = jobs.rows.map(r => r.id)
if (jobIds.length) {
  const invoices = await c.query(
    `SELECT id, invoice_number, job_id, customer_id, amount, status, due_date, created_at
     FROM invoices
     WHERE job_id = ANY($1::uuid[])
     ORDER BY created_at DESC`,
    [jobIds]
  )
  for (const r of invoices.rows) console.log(JSON.stringify(r, null, 2))
} else {
  console.log('(no jobs to look up invoices for)')
}

await c.end()
