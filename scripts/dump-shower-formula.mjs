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
   WHERE template_name IN ('Walk-in Shower (Small)','Walk-in Shower (Large)','Shower Floor Only')
   ORDER BY template_name`
)
for (const r of rows) {
  console.log(`\n=== ${r.template_name} ===`)
  for (const f of r.materials_formula || []) {
    console.log(`  ${f.item} | formula: ${f.formula}`)
  }
}
await c.end()
