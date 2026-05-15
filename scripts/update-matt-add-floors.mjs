// One-shot update: append 4 outside-floor scopes to Matt Metelitsa's
// existing 3-shower estimate (job #5). Bundled into a single set of 6
// line items per Vince's call: 3 days labor + raw-need materials for
// 152 sf total. Sqft breakdown lives in both the scope_notes prose AND
// the labor line description so Matt can order tile from F&D.
//
// Usage:  node scripts/update-matt-add-floors.mjs
// Safe to re-run? NO — appends every time. Run once.

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const JOB_ID = '30babe73-573a-4b81-8ef4-be7970df042e'
const FLOOR_SECTION = 'Outside floors — Bathrooms 1, 2, 3 + Half bath'

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
    // Read current state
    const cur = await db.query(
      `SELECT line_items, scope_notes, estimated_cost, estimated_days FROM jobs WHERE id = $1`,
      [JOB_ID]
    )
    if (!cur.rows[0]) throw new Error('Matt job not found')
    const oldLineItems = cur.rows[0].line_items
    const oldNotes = cur.rows[0].scope_notes ?? ''
    const oldCost = Number(cur.rows[0].estimated_cost)
    const oldDays = Number(cur.rows[0].estimated_days)

    // Refuse to re-run: if any existing item already has this section, bail.
    if (oldLineItems.some((it) => it.section === FLOOR_SECTION)) {
      console.log('Floor scope already appended — refusing to duplicate. No changes made.')
      return
    }

    // ── 6 new line items ───────────────────────────────────────────────
    // One consolidated labor line at 3 days (Vince's call, captures
    // efficiency credit for 4 floors back-to-back in one Newton house).
    // Materials qtys from raw 152 sf need, no clamp from the per-floor
    // template since this is bundled.
    const newLineItems = [
      {
        category: 'labor',
        section: FLOOR_SECTION,
        description:
          'Bathroom floor install — 4 floors (Bath 1: 40 sf, Bath 2: 40 sf, Bath 3: 50 sf, Half bath: 22 sf; total 152 sf). Demo existing flooring, Strata Mat uncoupling, dual-thinset bond (Platinum under + Gold over), tile set, grout, caulk. Includes toilet pull/reset.',
        quantity: 3,
        unit: 'day',
        unit_price: 1000,
        amount: 3000,
      },
      {
        category: 'materials',
        section: FLOOR_SECTION,
        description: 'Strata Mat (Laticrete uncoupling membrane) — substrate for all 4 floors (152 sf × 1.10 waste)',
        quantity: 168,
        unit: 'sq ft',
        unit_price: 1.60,
        amount: 268.80,
      },
      {
        category: 'materials',
        section: FLOOR_SECTION,
        description: 'Thinset — 254 Platinum (50 lb) — bonds Strata Mat to subfloor',
        quantity: 4,
        unit: 'bag',
        unit_price: 59,
        amount: 236,
      },
      {
        category: 'materials',
        section: FLOOR_SECTION,
        description: 'Thinset — 253 Gold (50 lb) — bonds tile to Strata Mat',
        quantity: 4,
        unit: 'bag',
        unit_price: 28,
        amount: 112,
      },
      {
        category: 'materials',
        section: FLOOR_SECTION,
        description: 'Grout 25 lb (bag) — same color across all 4 floors',
        quantity: 4,
        unit: 'bag',
        unit_price: 30,
        amount: 120,
      },
      {
        category: 'materials',
        section: FLOOR_SECTION,
        description: 'Caulking — transitions + thresholds, 1 tube per bathroom',
        quantity: 4,
        unit: 'tube',
        unit_price: 17,
        amount: 68,
      },
    ]
    const floorAddTotal = newLineItems.reduce((s, i) => s + i.amount, 0)
    const allLineItems = [...oldLineItems, ...newLineItems]

    // ── Append scope_notes addendum so customer sees sqft per bathroom ─
    const notesAddendum = `

═══════════════════════════════════════════════
ADDED 2026-05-15 — OUTSIDE BATHROOM FLOORS

Tile the bathroom floor (outside the shower) in all 3 full bathrooms plus the half bath. Customer-provided tile.

Floor areas (so you can order tile from F&D — order ~10% extra for cuts/waste):
  • Bathroom 1 floor: 40 sq ft  (order ~44 sq ft of tile)
  • Bathroom 2 floor: 40 sq ft  (order ~44 sq ft of tile)
  • Bathroom 3 floor: 50 sq ft  (order ~55 sq ft of tile)
  • Half bath floor: 22 sq ft  (order ~25 sq ft of tile)
  • TOTAL: 152 sq ft  (order ~167 sq ft of tile)

WHAT WE PROVIDE:
  • Demo of existing flooring (vinyl/old tile/etc.)
  • Toilet pull + reset on each bathroom
  • Strata Mat uncoupling membrane (Laticrete) — protects new tile from subfloor movement
  • Dual-thinset bond: 254 Platinum under the membrane + 253 Gold tile-to-membrane (per Schluter/Laticrete spec)
  • Tile set, grout (we supply, color per your pick), caulk at transitions
  • Bundled into one efficient 3-day install — same trip, same crew, same setup

NOT INCLUDED:
  • Vanity / toilet REMOVAL (we pull + reset the toilet; if a vanity needs to come out, that's a separate carpentry add — let us know).
  • Self-leveling compound if any subfloor is bouncy or out of plane (assessed on-site).
  • Baseboard / shoe molding re-install — finish carpentry is separate; we cut clean to the wall plate.`

    const newNotes = oldNotes + notesAddendum
    const newCost = oldCost + floorAddTotal
    const newDays = oldDays + 3

    // ── Write everything in a single transaction ───────────────────────
    await db.query('BEGIN')
    try {
      await db.query(
        `UPDATE jobs
         SET line_items = $1::jsonb,
             scope_notes = $2,
             estimated_cost = $3,
             estimated_days = $4
         WHERE id = $5`,
        [JSON.stringify(allLineItems), newNotes, newCost, newDays, JOB_ID]
      )
      await db.query('COMMIT')
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }

    console.log('========================================')
    console.log('UPDATED job', JOB_ID)
    console.log('  Line items: ' + oldLineItems.length + ' → ' + allLineItems.length + ' (+6)')
    console.log('  Estimated cost: $' + oldCost.toFixed(2) + ' → $' + newCost.toFixed(2) + ' (+$' + floorAddTotal.toFixed(2) + ')')
    console.log('  Estimated days: ' + oldDays + ' → ' + newDays + ' (+3)')
    console.log('  scope_notes: appended floor section with sqft breakdown')
    console.log('========================================')
  } finally {
    await db.end()
  }
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
