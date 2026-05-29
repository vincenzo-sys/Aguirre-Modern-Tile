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

const mat = await c.query(
  `SELECT item, your_cost, price_to_customer, coverage, unit
   FROM materials_pricing
   WHERE item ILIKE '%strata%'`
)
console.log('Strata Mat in catalog:')
for (const r of mat.rows) console.log(` ${r.item} — $${r.your_cost}/$${r.price_to_customer} per ${r.unit}`)

const tpls = await c.query(
  `SELECT template_name, materials_formula, typical_materials
   FROM job_templates
   WHERE template_name LIKE '%Floor%' OR template_name = 'Tub Surround + Bathroom Floor'
   ORDER BY template_name`
)
console.log('\nFloor templates after migration 030:')
for (const r of tpls.rows) {
  const items = (r.materials_formula || []).map((f) => f.item)
  const usesStrata = items.some((i) => i.includes('Strata'))
  const usesCement = items.some((i) => i.includes('Cement'))
  console.log(`\n ${usesStrata ? '✓' : '✗'} ${r.template_name}`)
  console.log(`    items: ${items.join(', ')}`)
  console.log(`    typical: ${(r.typical_materials || '').slice(0, 100)}`)
  if (usesCement && !usesStrata) console.log('    ⚠ still uses cement board')
}

await c.end()
