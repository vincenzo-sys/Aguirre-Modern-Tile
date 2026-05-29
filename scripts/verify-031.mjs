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
  `SELECT template_name, materials_formula
   FROM job_templates
   WHERE template_name IN (
     'Bathroom Floor (Small)','Bathroom Floor (Medium)',
     'Kitchen Floor (Small)','Kitchen Floor (Large)',
     'Tub Surround + Bathroom Floor',
     'Walk-in Shower (Small)','Walk-in Shower (Large)','Shower Floor Only'
   )
   ORDER BY template_name`
)

console.log('Thinset layering check (Platinum + Gold = floor; Gold only = shower):')
for (const r of rows) {
  const items = (r.materials_formula || []).map((f) => f.item)
  const platinum = items.find((i) => i.includes('254 Platinum'))
  const gold = items.find((i) => i.includes('253 Gold'))
  const shower = r.template_name.includes('Shower')
  const expected = shower ? 'Gold only' : 'Platinum + Gold'
  const got = `${platinum ? 'Pl' : '—'} + ${gold ? 'Gd' : '—'}`
  const ok = shower ? !platinum && gold : platinum && gold
  console.log(`  ${ok ? '✓' : '✗'} ${r.template_name.padEnd(40)} ${got}  (expected ${expected})`)
}

const links = await c.query(
  `SELECT item, retail_link FROM materials_pricing
   WHERE item LIKE '%254 Platinum%' OR item LIKE '%Strata%'
   ORDER BY item`
)
console.log('\nRetail links repaired:')
for (const r of links.rows) console.log(`  ${r.item}: ${r.retail_link}`)

await c.end()
