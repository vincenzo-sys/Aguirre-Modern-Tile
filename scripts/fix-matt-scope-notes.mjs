// Surgical scope_notes fix for Matt's job: pull the half bath up into
// the top SCOPE OF WORK header so it's not hidden in the dated addendum
// below. Also bumps "3 section(s) → 4", adds a 4th scope line for the
// bundled floors, fixes the total crew days, and clarifies that the
// half bath is a standalone floor (no shower).
//
// Idempotent guard: bails if "4 section(s)" already present.

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const JOB_ID = '30babe73-573a-4b81-8ef4-be7970df042e'

async function loadEnv() {
  const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

async function main() {
  await loadEnv()
  const db = new pg.Client({ connectionString: process.env.DATABASE_URI, ssl: { rejectUnauthorized: false } })
  await db.connect()
  try {
    const cur = await db.query(`SELECT scope_notes FROM jobs WHERE id = $1`, [JOB_ID])
    let notes = cur.rows[0].scope_notes ?? ''
    if (notes.includes('This estimate covers 4 section(s)')) {
      console.log('Scope notes already updated — no changes made.')
      return
    }

    // ── Edit 1: Top SCOPE OF WORK paragraph — mention the half bath ──
    notes = notes.replace(
      'Convert 3 bathrooms from existing acrylic tub/shower enclosures to tile walk-in showers. Each shower includes full demo of the acrylic enclosure, GoBoard waterproofing on all wet walls, Schluter Kerdi tray + linear curb, and full-height tile install (3 walls + floor).',
      "Convert 3 full bathrooms from existing acrylic tub/shower enclosures to tile walk-in showers AND tile the floors in all 4 bathrooms (3 full baths plus a half bath). Each shower includes full demo of the acrylic enclosure, GoBoard waterproofing on all wet walls, Schluter Kerdi tray + linear curb, and full-height tile install (3 walls + floor). Each floor includes demo of existing flooring, Strata Mat uncoupling membrane, and tile install."
    )

    // ── Edit 2: "covers 3 section(s)" → 4 ────────────────────────────
    notes = notes.replace('This estimate covers 3 section(s):', 'This estimate covers 4 section(s):')

    // ── Edit 3: Insert a 4th scope line for the floors, before the
    //           "Total crew days" line. Anchored on "Total crew days:".
    const floorScopeLine =
      "  - Outside floors (4 bathrooms): Bathroom Floor (Strata Mat + dual-thinset), 152 sf total, 3.0 days ($3,804.80 labor + materials)\n" +
      "      Bath 1: 40 sf · Bath 2: 40 sf · Bath 3: 50 sf · Half bath: 22 sf. Demo existing flooring, Strata Mat uncoupling membrane, dual-thinset bond, tile set, grout. Customer-provided tile.\n\n"
    notes = notes.replace('Total crew days: 9.25', floorScopeLine + 'Total crew days: 12.25')

    // ── Edit 4: Clarify the half bath in the dated addendum ──────────
    notes = notes.replace(
      'Tile the bathroom floor (outside the shower) in all 3 full bathrooms plus the half bath. Customer-provided tile.',
      'Tile bathroom floors in 4 rooms: the floor outside each new shower in Bathrooms 1, 2, and 3 (full baths), plus the floor of the half bath (no shower in that room — just tile the floor). Customer-provided tile.'
    )

    // Sanity check that edits 1-4 actually fired
    if (!notes.includes('4 section(s)')) throw new Error('Edit 2 did not apply — text mismatch')
    if (!notes.includes('Total crew days: 12.25')) throw new Error('Edit 3 did not apply — anchor not found')
    if (!notes.includes('AND tile the floors in all 4 bathrooms')) throw new Error('Edit 1 did not apply')

    await db.query(`UPDATE jobs SET scope_notes = $1 WHERE id = $2`, [notes, JOB_ID])
    console.log('scope_notes updated.')
    console.log('  Top paragraph now mentions 4 bathrooms (3 full + half bath floor)')
    console.log('  Section count: 3 → 4')
    console.log('  4th scope line inserted (floors, 152 sf, 3 days)')
    console.log('  Crew days: 9.25 → 12.25')
    console.log('  Dated addendum clarified: half bath has no shower')
  } finally {
    await db.end()
  }
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
