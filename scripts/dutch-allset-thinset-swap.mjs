// Dutch (job #62): swap thinset spec to Schluter ALL-SET for the
// Ditra-Heat floor portion per Schluter warranty requirements.
//
// Schluter ALL-SET is the only modified thinset Schluter approves over
// Ditra-Heat (fills membrane channels + bonds tile). Also approved
// under the membrane. Using it both sides keeps the install spec-
// compliant and preserves the membrane + cable warranty.
//
// Changes:
//   - Remove "Thinset - 254 Platinum (50 lb)" entirely (was 2 bags for
//     under-Strata-Mat — Ditra-Heat now occupies that role)
//   - Reduce "Thinset - 253 Gold (50 lb)" from 4 bags to 2 (drops the
//     floor portion that bonded tile to Strata Mat; walls keep 2 bags)
//   - Add Schluter ALL-SET (3 bags: 1 under + 2 over per Schluter spec
//     for ~50 sf floor with Ditra-Heat channels)
//   - Pass-through pricing on ALL-SET: F&D $38.73 + 6.25% MA tax =
//     $41.15 customer (matches the heated-floor pricing rule)
//   - Source URL on the new line so the customer sees "(view)" link
//
// Also seeds Schluter ALL-SET in materials_pricing for future jobs
// (canonical row with 20% markup; pass-through is a per-job decision).

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const JOB_ID = '7a3536b4-0461-4d8b-9949-1213cd3da60d'
const SECTION = 'Heated floor upgrade'

// F&D 2026-05-19
const ALLSET_RETAIL = 38.73
const TAX = 1.0625
const ALLSET_PASS_THROUGH = Number((ALLSET_RETAIL * TAX).toFixed(2)) // 41.15
const ALLSET_BAGS = 3
const ALLSET_URL = 'https://www.flooranddecor.com/tile-mortars-and-thinsets-installation-materials/schluter-all-set-gray-modified-thin-set-mortar-100609817.html'

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
    await db.query('BEGIN')

    // ── 1. Seed Schluter ALL-SET in materials_pricing (idempotent) ────
    const itemName = 'Schluter ALL-SET Gray Modified Thinset Mortar (50 lb)'
    const exists = await db.query(`SELECT id FROM materials_pricing WHERE item = $1`, [itemName])
    if (exists.rowCount === 0) {
      await db.query(
        `INSERT INTO materials_pricing (item, category, your_cost, markup_percent, price_to_customer, coverage, unit, retail_link)
         VALUES ($1, 'Thinset', $2, 0.20, $3, 30.0, 'sq ft/bag', $4)`,
        [itemName, ALLSET_RETAIL, Number((ALLSET_RETAIL * 1.20).toFixed(2)), ALLSET_URL]
      )
      console.log('Seeded materials_pricing: ' + itemName)
    }

    // ── 2. Read job ───────────────────────────────────────────────────
    const cur = await db.query(
      `SELECT line_items, estimated_cost, scope_notes FROM jobs WHERE id = $1`,
      [JOB_ID]
    )
    const oldItems = cur.rows[0].line_items
    const oldCost = Number(cur.rows[0].estimated_cost)
    const oldNotes = cur.rows[0].scope_notes ?? ''

    if (oldItems.some((li) => li.description && li.description.startsWith('Schluter ALL-SET'))) {
      await db.query('ROLLBACK')
      console.log('ALL-SET already on this job — bailing.')
      return
    }

    // ── 3. Rewrite line items ─────────────────────────────────────────
    let removedAmount = 0
    const newItems = []
    for (const li of oldItems) {
      if (li.description && li.description.startsWith('Thinset - 254 Platinum')) {
        // Drop entirely (was 2 bags for floor — Ditra-Heat replaces that role)
        removedAmount += Number(li.amount)
        console.log(`Removed: ${li.description}, ${li.quantity} bags, $${li.amount}`)
        continue
      }
      if (li.description && li.description.startsWith('Thinset - 253 Gold')) {
        // Reduce from 4 bags → 2 bags (drops the floor tile-to-membrane portion)
        const oldAmt = Number(li.amount)
        const newQty = 2
        const newAmt = Number((newQty * li.unit_price).toFixed(2))
        removedAmount += oldAmt - newAmt
        console.log(`Reduced: ${li.description}, ${li.quantity} → ${newQty} bags, $${oldAmt} → $${newAmt}`)
        newItems.push({ ...li, quantity: newQty, amount: newAmt, description: 'Thinset - 253 Gold (50 lb) — for wall thinset on the GoBoard tub surround' })
        continue
      }
      newItems.push(li)
    }

    // Add the new ALL-SET line in the heated-floor section
    const allsetLine = {
      category: 'materials',
      section: SECTION,
      description: 'Schluter ALL-SET modified thinset mortar (50 lb, Gray) — Schluter-required thinset for use over Ditra-Heat (fills membrane channels + bonds tile). Spec: 1 bag under the membrane + 2 bags over for a 48 sf floor. Priced at F&D cost + 6.25% MA sales tax (pass-through, no markup).',
      quantity: ALLSET_BAGS,
      unit: 'bag',
      unit_price: ALLSET_PASS_THROUGH,
      amount: Number((ALLSET_BAGS * ALLSET_PASS_THROUGH).toFixed(2)),
      source_url: ALLSET_URL,
      source_name: 'Schluter ALL-SET Gray Modified Thinset Mortar at flooranddecor.com',
    }
    newItems.push(allsetLine)
    const addedAmount = Number(allsetLine.amount)
    console.log(`Added: ${ALLSET_BAGS} bags Schluter ALL-SET @ $${ALLSET_PASS_THROUGH}/bag = $${addedAmount}`)

    const newCost = Number((oldCost - removedAmount + addedAmount).toFixed(2))

    // ── 4. Add a thinset note to scope_notes ─────────────────────────
    const noteMarker = '\nHEATED BATHROOM FLOOR — Schluter Ditra-Heat (revised 2026-05-19)'
    let newNotes = oldNotes
    const thinsetNote = `

THINSET CHANGE (2026-05-19): Per Schluter's Ditra-Heat install spec, replaced the floor portion of our usual 254 Platinum / 253 Gold thinset combo with Schluter ALL-SET (the only modified thinset Schluter approves for use over Ditra-Heat — fills the membrane channels and bonds tile in one product). Wall thinset on the GoBoard tub surround stays as 253 Gold. Required for Schluter warranty coverage on the heated floor.`
    if (newNotes.includes(noteMarker) && !newNotes.includes('THINSET CHANGE')) {
      newNotes = newNotes + thinsetNote
    }

    await db.query(
      `UPDATE jobs SET line_items = $1::jsonb, estimated_cost = $2, scope_notes = $3 WHERE id = $4`,
      [JSON.stringify(newItems), newCost, newNotes, JOB_ID]
    )
    await db.query('COMMIT')

    console.log('\n========================================')
    console.log('UPDATED Dutch job #62')
    console.log('  Removed/reduced thinsets: -$' + removedAmount.toFixed(2))
    console.log('  Added ALL-SET (3 bags):   +$' + addedAmount.toFixed(2))
    console.log('  Net change:               $' + (newCost - oldCost).toFixed(2))
    console.log('  Line items:               ' + oldItems.length + ' → ' + newItems.length)
    console.log('  Cost:                     $' + oldCost.toFixed(2) + ' → $' + newCost.toFixed(2))
    console.log('========================================')
  } catch (e) {
    await db.query('ROLLBACK')
    throw e
  } finally {
    await db.end()
  }
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
