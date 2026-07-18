// Spec-based quantity correction to job_templates.materials_formula (2026-07-18).
//
// From manufacturer TDS coverage + Vince's inputs (safety cushion; floors are
// 12x12+, showers 6x6-12x12). Fixes the floor over-ordering:
//   - 254 Platinum that BONDS the Strata Mat is a thin 1/4x3/16 coat (~110 ft2/bag
//     spec) but was priced like tile mortar (~50). -> 90 ft2/bag (cushioned).
//   - 253 Gold tile coat: spec ~65 -> 60 ft2/bag (cushioned).
//   - Floor grout (12x12+ tile): spec ~388 -> 300 ft2/bag (cushioned).
//   - Shower grout (6x6-12x12): spec 146-388 -> 150 ft2/bag (conservative).
// min/max clamps loosened so small floors get 1 bag (not a forced 2).
// Everything else (GoBoard, mud bed, cement, Strata sheets, large-format 254,
// backsplash/fireplace grout, wall thinset) is UNCHANGED.
//
// Surgical: matches each formula entry by (template_name, item, applies_when)
// and replaces only formula/min/max. Backs up all template formulas first.
// Transactional; prints before/after.
//   node scripts/apply-formula-coverage-2026-07-18.mjs

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const P = 'Thinset - 254 Platinum (50 lb)'
const G = 'Thinset - 253 Gold (50 lb)'
const GR = 'Grout 25 lb (bag)'

// template | item | applies_when (null = entry has none) | new formula | min | max
const CHANGES = [
  // ---- Floors: Platinum under-mat -> /90, 253 Gold -> /60, grout -> /300 ----
  ['Bathroom Floor (Small)',  P,  '!cement_board_floor', 'ceil(sqft / 90)', 1, 2],
  ['Bathroom Floor (Small)',  G,  null,                  'ceil(sqft / 60)', 1, 2],
  ['Bathroom Floor (Small)',  GR, null,                  'ceil(sqft / 300)', 1, 2],
  ['Bathroom Floor (Medium)', P,  '!cement_board_floor', 'ceil(sqft / 90)', 1, 3],
  ['Bathroom Floor (Medium)', G,  null,                  'ceil(sqft / 60)', 1, 3],
  ['Bathroom Floor (Medium)', GR, null,                  'ceil(sqft / 300)', 1, 2],
  ['Kitchen Floor (Small)',   P,  '!cement_board_floor', 'ceil(sqft / 90)', 1, 3],
  ['Kitchen Floor (Small)',   G,  null,                  'ceil(sqft / 60)', 1, 3],
  ['Kitchen Floor (Small)',   GR, null,                  'ceil(sqft / 300)', 1, 2],
  ['Kitchen Floor (Large)',   P,  '!cement_board_floor', 'ceil(sqft / 90)', 1, 4],
  ['Kitchen Floor (Large)',   G,  null,                  'ceil(sqft / 60)', 1, 5],
  ['Kitchen Floor (Large)',   GR, null,                  'ceil(sqft / 300)', 1, 3],
  ['Half Bathroom (Floor + Short Walls)', P,  '!cement_board_floor', 'ceil(sub_sqft.bathroom_floor / 90)', 1, 2],
  ['Half Bathroom (Floor + Short Walls)', G,  null,                  'ceil(sqft / 60)', 1, 2],
  ['Half Bathroom (Floor + Short Walls)', GR, null,                  'ceil(sqft / 300)', 1, 2],
  // ---- Showers/tub: outside-floor Platinum under-mat -> /90, grout -> /150 ----
  ['Standard Tub Surround',       P,  '!cement_board_floor', 'ceil(sub_sqft.outside_floor / 90)', 0, 2],
  ['Standard Tub Surround',       GR, null,                  'ceil(sqft / 150)', 1, 2],
  ['Tub Surround + Bathroom Floor', P,  '!cement_board_floor', 'ceil(sub_sqft.bathroom_floor / 90)', 0, 3],
  ['Tub Surround + Bathroom Floor', GR, null,                  'ceil(sqft / 150)', 1, 3],
  ['Walk-in Shower (Small)',      P,  '!cement_board_floor', 'ceil(sub_sqft.outside_floor / 90)', 0, 2],
  ['Walk-in Shower (Small)',      GR, null,                  'ceil(sqft / 150)', 1, 2],
  ['Walk-in Shower (Large)',      P,  '!cement_board_floor', 'ceil(sub_sqft.outside_floor / 90)', 0, 3],
  ['Walk-in Shower (Large)',      GR, null,                  'ceil(sqft / 150)', 1, 3],
  ['Walk-in Shower (Traditional Schluter)', GR, null,        'ceil(sqft / 150)', 1, 2],
]

const c = new pg.Client({ connectionString: process.env.DATABASE_URI })
await c.connect()
try {
  const { rows } = await c.query('SELECT id, template_name, materials_formula FROM job_templates ORDER BY template_name')
  // Backup all formulas first.
  const backup = rows.map((r) => ({ template_name: r.template_name, materials_formula: r.materials_formula }))
  await fs.writeFile(
    path.resolve('scripts/backups/job_templates_formulas_2026-07-18.json'),
    JSON.stringify(backup, null, 2),
  )

  const byName = new Map(rows.map((r) => [r.template_name, r]))
  await c.query('BEGIN')
  let applied = 0, missed = 0
  const touched = new Map() // template_name -> updated formula array

  for (const [tName, item, when, formula, min, max] of CHANGES) {
    const row = byName.get(tName)
    if (!row) { console.log(`MISS (no template): ${tName}`); missed++; continue }
    const f = touched.get(tName) ?? (Array.isArray(row.materials_formula) ? row.materials_formula.map((e) => ({ ...e })) : [])
    const entry = f.find((e) => e.item === item && (e.applies_when ?? null) === (when ?? null))
    if (!entry) { console.log(`MISS (no entry): ${tName} / ${item} / when=${when ?? '-'}`); missed++; continue }
    const beforeF = entry.formula, beforeMin = entry.min, beforeMax = entry.max
    entry.formula = formula; entry.min = min; entry.max = max
    touched.set(tName, f)
    applied++
    console.log(`~ ${tName}\n    ${item}${when ? '  ['+when+']' : ''}\n      ${beforeF}  {${beforeMin}-${beforeMax}}  ->  ${formula}  {${min}-${max}}`)
  }

  for (const [tName, f] of touched) {
    await c.query('UPDATE job_templates SET materials_formula = $1, updated_at = NOW() WHERE template_name = $2', [JSON.stringify(f), tName])
  }
  await c.query('COMMIT')
  console.log(`\nCommitted ${applied} formula changes across ${touched.size} templates. Missed: ${missed}.`)
  console.log('Backup: scripts/backups/job_templates_formulas_2026-07-18.json')
} catch (err) {
  await c.query('ROLLBACK')
  console.error('ROLLED BACK:', err.message)
  process.exitCode = 1
} finally {
  await c.end()
}
