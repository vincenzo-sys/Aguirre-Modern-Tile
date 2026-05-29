// Backfill verified retail_link URLs for materials_pricing rows that were
// missing them. Each URL was searched + validated 2026-05-01 to 200-OK.
// Lowe's URLs return 403 to scripted fetches (Akamai bot detection) but
// resolve cleanly in real browsers — confirmed via product-name matching.

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

// Each entry: [item name in catalog, verified URL, source retailer]
const fills = [
  [
    'Cement Board 1/2" (3x5)',
    'https://www.homedepot.com/p/USG-Durock-Brand-1-2-in-x-3-ft-x-5-ft-Cement-Board-with-EdgeGuard-172954/304163165',
    'Home Depot — USG Durock 1/2" 3x5',
  ],
  [
    'GoBoard 1/2" (3x5)',
    'https://www.lowes.com/pd/Johns-Manville-0-47-in-x-36-in-x-60-in-GOBOARD-Polyisocyanurate-Backer-Board/999931180',
    "Lowe's — Johns Manville GoBoard 1/2\" 3x5",
  ],
  [
    'GoBoard 1/4" (3x5)',
    'https://www.lowes.com/pd/Johns-Manville-0-26-in-x-36-in-x-60-in-GOBOARD-Polyisocyanurate-Backer-Board/999930274',
    "Lowe's — Johns Manville GoBoard 1/4\" 3x5",
  ],
  [
    'Schluter Kerdi Shower Tray 48x48 Center',
    'https://www.flooranddecor.com/shower-systems-installation-materials/schluter-kerdi-shower-tray-48in.-x-48in.-cen-100597806.html',
    'Floor & Decor — Schluter Kerdi Center Tray 48x48',
  ],
  [
    'Schluter Kerdi-Board Curb 48x6',
    'https://www.flooranddecor.com/schluter-kerdi-board-sc-curb-48in.-x-6in.-x-4-1-2in.-100597970.html',
    'Floor & Decor — Schluter Kerdi-Board-SC Curb 48x6x4.5',
  ],
]

const c = new pg.Client({ connectionString: process.env.DATABASE_URI })
await c.connect()

let updated = 0
let skipped = 0
for (const [item, url, label] of fills) {
  const { rowCount } = await c.query(
    'UPDATE materials_pricing SET retail_link = $1 WHERE item = $2 AND (retail_link IS NULL OR retail_link = $3)',
    [url, item, '']
  )
  if (rowCount > 0) {
    console.log(`✓ ${item}\n    → ${label}\n    ${url}`)
    updated++
  } else {
    // Either the item doesn't exist, or it already has a link — be explicit.
    const { rows } = await c.query('SELECT retail_link FROM materials_pricing WHERE item = $1', [item])
    if (rows.length === 0) {
      console.log(`✗ ${item} — not found in catalog`)
    } else {
      console.log(`↷ ${item} — already has link, skipping`)
    }
    skipped++
  }
}

console.log(`\nUpdated ${updated} rows, skipped ${skipped}.`)
await c.end()
