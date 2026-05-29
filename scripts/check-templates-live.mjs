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
  `SELECT template_name, job_type, customer_provides_default IS NOT NULL AS has_cp,
          jsonb_array_length(materials_formula) AS material_count
   FROM job_templates
   ORDER BY template_name`
)
console.log(`Total templates in job_templates table: ${rows.length}`)
console.log('')
for (const r of rows) {
  const k = r.template_name.startsWith('Kitchen') ? '🆕' : '  '
  console.log(`${k} ${r.template_name.padEnd(40)} ${r.job_type.padEnd(12)} cp=${r.has_cp ? '✓' : '✗'} mats=${r.material_count}`)
}
await c.end()
