// One-shot verification that migrations 028 + 029 landed correctly.
// Deletes itself when finished is up to you — feel free to keep around.

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

async function loadEnv() {
  const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

await loadEnv()
const client = new pg.Client({ connectionString: process.env.DATABASE_URI })
await client.connect()

const kitchen = await client.query(
  `SELECT template_name, base_price_low, base_price_high, install_days, customer_provides_default
   FROM job_templates
   WHERE template_name LIKE 'Kitchen Floor%'
   ORDER BY template_name`
)
console.log('Kitchen templates:')
for (const r of kitchen.rows) {
  console.log(`  ${r.template_name}: $${r.base_price_low}-${r.base_price_high}, ${r.install_days}d install`)
  console.log(`    cust provides: ${(r.customer_provides_default ?? '').slice(0, 80)}...`)
}

const defaults = await client.query(`SELECT * FROM estimate_defaults WHERE id = 1`)
const d = defaults.rows[0]
console.log('\nestimate_defaults singleton:')
console.log(`  warranty_years: ${d.warranty_years}`)
console.log(`  deposit: ${d.deposit_percent}% refundable until ${d.deposit_refund_window_hours}h before start`)
console.log(`  payment_methods: ${JSON.stringify(d.payment_methods)}`)
console.log(`  warranty_text: ${d.warranty_text.slice(0, 80)}...`)

const seeded = await client.query(
  `SELECT template_name, customer_provides_default IS NOT NULL AS seeded
   FROM job_templates
   ORDER BY template_name`
)
console.log('\nPer-template customer-provides seeded:')
for (const r of seeded.rows) {
  console.log(`  ${r.seeded ? '✓' : '✗'} ${r.template_name}`)
}

const cols = await client.query(
  `SELECT column_name FROM information_schema.columns
   WHERE table_name='jobs' AND column_name IN ('warranty_text','payment_terms_text','payment_methods')
   ORDER BY column_name`
)
console.log(`\njobs new columns: ${cols.rows.map((r) => r.column_name).join(', ')}`)

await client.end()
