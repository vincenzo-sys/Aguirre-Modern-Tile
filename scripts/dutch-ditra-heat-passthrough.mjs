// Dutch job #62: revise the Ditra-Heat lines per Vince's pricing call.
//
// Changes from prior version (dutch-add-ditra-heat.mjs):
//   1. Swap thermostat: WiFi/programmable → non-programmable Ditra-Heat-E-R
//      (F&D retail $175 instead of $378)
//   2. Pass-through pricing on all 3 heated-floor materials: F&D retail
//      + 6.25% MA sales tax, NO 20% markup. Aguirre's margin on this
//      upgrade comes from the labor charge alone.
//   3. Labor: $100 flat (thermostat wire run) instead of 0.5 install
//      day at $1,050. Days back to 4.
//
// Seeds the non-programmable thermostat as a new materials_pricing row
// (existing DB row "Schluter Ditra-Heat WiFi Thermostat" stays — it's
// still the right pick for jobs where customer wants the upgrade).

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const JOB_ID = '7a3536b4-0461-4d8b-9949-1213cd3da60d'
const SECTION = 'Heated floor upgrade'

// MA sales tax
const TAX = 1.0625

// F&D retail (verified 2026-05-19) → customer price = retail + tax
const MEMBRANE_RETAIL = 24.90 // per 8.6 sf sheet
const CABLE_RETAIL = 339.80   // 32 sf 120V cable
const THERMOSTAT_RETAIL = 175.00 // non-programmable (Ditra-Heat-E-R, SKU 100227602)

const MEMBRANE_PRICE = Number((MEMBRANE_RETAIL * TAX).toFixed(2))     // 26.46
const CABLE_PRICE = Number((CABLE_RETAIL * TAX).toFixed(2))           // 361.04
const THERMOSTAT_PRICE = Number((THERMOSTAT_RETAIL * TAX).toFixed(2)) // 185.94
const MEMBRANE_SHEETS = 6
const WIRE_LABOR = 100 // flat charge for thermostat-wire run

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

    // ── 1. Seed non-programmable thermostat in materials_pricing ─────
    const tItem = 'Schluter Ditra-Heat-E-R Non-Programmable Thermostat'
    const tExist = await db.query(`SELECT id FROM materials_pricing WHERE item = $1`, [tItem])
    if (tExist.rowCount === 0) {
      await db.query(
        `INSERT INTO materials_pricing (item, category, your_cost, markup_percent, price_to_customer, coverage, unit, retail_link)
         VALUES ($1, 'Heating', $2, 0.20, $3, 1.00, 'per piece', $4)`,
        [
          tItem,
          THERMOSTAT_RETAIL,
          Number((THERMOSTAT_RETAIL * 1.20).toFixed(2)), // canonical 20% markup price for future non-passthrough jobs
          'https://www.flooranddecor.com/floor-warming-systems-trending-installation-materials/schluter-ditra-heat-e-r-non-programmable-thermostat-white-100216241.html',
        ]
      )
      console.log('Seeded materials_pricing: ' + tItem)
    }

    // ── 2. Read job + strip the prior Ditra-Heat upgrade lines ───────
    const cur = await db.query(
      `SELECT line_items, estimated_cost, estimated_days, scope_notes FROM jobs WHERE id = $1`,
      [JOB_ID]
    )
    const oldItems = cur.rows[0].line_items
    const oldCost = Number(cur.rows[0].estimated_cost)
    const oldDays = Number(cur.rows[0].estimated_days)
    const oldNotes = cur.rows[0].scope_notes ?? ''

    const removedItems = oldItems.filter((li) => li.section === SECTION)
    const keptItems = oldItems.filter((li) => li.section !== SECTION)
    const removedAmount = removedItems.reduce((s, li) => s + Number(li.amount), 0)
    if (removedItems.length === 0) {
      await db.query('ROLLBACK')
      console.log('No "' + SECTION + '" lines to revise. Did you run dutch-add-ditra-heat.mjs first?')
      return
    }
    console.log('Removed ' + removedItems.length + ' prior heated-floor lines totaling $' + removedAmount.toFixed(2))

    // ── 3. Build new heated-floor lines (pass-through pricing) ───────
    const membraneAmount = Number((MEMBRANE_SHEETS * MEMBRANE_PRICE).toFixed(2))
    const newLines = [
      {
        category: 'materials',
        section: SECTION,
        description: 'Schluter Ditra-Heat membrane sheets (8.6 sf each) — uncoupling + integrated heating-cable channels, replaces Strata Mat for the heated build. Priced at F&D cost + 6.25% MA sales tax (pass-through, no markup).',
        quantity: MEMBRANE_SHEETS,
        unit: 'sheet',
        unit_price: MEMBRANE_PRICE,
        amount: membraneAmount,
      },
      {
        category: 'materials',
        section: SECTION,
        description: 'Schluter Ditra-Heat 120V heating cable (32 sf coverage). 120V means standard residential wiring — no dedicated 240V breaker. Priced at F&D cost + 6.25% MA sales tax (pass-through, no markup).',
        quantity: 1,
        unit: 'ea',
        unit_price: CABLE_PRICE,
        amount: CABLE_PRICE,
      },
      {
        category: 'materials',
        section: SECTION,
        description: 'Schluter Ditra-Heat-E-R non-programmable thermostat — simple on/off with temperature dial, integrated floor sensor. Priced at F&D cost + 6.25% MA sales tax (pass-through, no markup).',
        quantity: 1,
        unit: 'ea',
        unit_price: THERMOSTAT_PRICE,
        amount: THERMOSTAT_PRICE,
      },
      {
        category: 'labor',
        section: SECTION,
        description: 'Labor — lay heating cable in Ditra-Heat membrane channels, ohm-test cable before AND after tile install (Schluter warranty requirement), set thermostat box + connect floor sensor wire. Line-voltage hookup at the thermostat by customer\'s electrician.',
        quantity: 1,
        unit: 'ea',
        unit_price: WIRE_LABOR,
        amount: WIRE_LABOR,
      },
    ]
    const addedAmount = newLines.reduce((s, li) => s + Number(li.amount), 0)
    const newItems = [...keptItems, ...newLines]
    const newCost = Number((oldCost - removedAmount + addedAmount).toFixed(2))

    // Days: drop the +1 we'd added when including the 0.5 day labor
    const newDays = oldDays - 1

    // ── 4. Rewrite the scope_notes section ────────────────────────────
    const addendumMarker = '═══════════════════════════════════════════════\nUPGRADED 2026-05-19 — HEATED BATHROOM FLOOR'
    const idx = oldNotes.indexOf(addendumMarker)
    const baseNotes = idx >= 0 ? oldNotes.slice(0, idx).trimEnd() : oldNotes.trimEnd()

    const newAddendum = `

═══════════════════════════════════════════════
HEATED BATHROOM FLOOR — Schluter Ditra-Heat (revised 2026-05-19)

Replacing Strata Mat with the Schluter Ditra-Heat system so the bathroom floor stays warm year-round. Same Schluter uncoupling family — but the membrane has integrated channels for a 120V heating cable, and a wall-mounted thermostat lets you turn it on/off and set the floor temperature.

WHAT WE'RE ADDING (priced at our cost from Floor & Decor + 6.25% MA sales tax — no markup on materials)
  • Schluter Ditra-Heat membrane (6 sheets × 8.6 sf = 51.6 sf coverage)
  • Schluter Ditra-Heat 120V heating cable, 32 sf coverage — heats the open floor area (excludes under vanity + toilet, where heat would be wasted or unsafe per Schluter spec)
  • Schluter Ditra-Heat-E-R non-programmable thermostat — simple on/off dial with integrated floor sensor, no app or schedule (clean, reliable, no firmware to think about)
  • $100 labor for the heating-cable layout + ohm test + thermostat box install (the rest of the work is absorbed in the existing install days)

ELECTRICAL — STILL OUT OF OUR SCOPE
The 120V cable runs on a standard residential circuit. The line-voltage hookup is your electrician's job:
  • Run a 120V line to the thermostat location (typically next to the light switch by the bathroom door)
  • GFCI-protect the heating circuit (NEC requirement)
  • Connect line voltage to the thermostat box we install
  • Final continuity test
We can recommend an electrician if you don't have one. Typical electrician cost: $200-350 for this scope.

WARRANTY HANDOFF
We register the Ditra-Heat installation with Schluter on completion:
  • Lifetime warranty on the membrane
  • 5-year warranty on the heating cable
  • 3-year Aguirre Modern Tile warranty on installation labor

HOW THE FLOOR WILL FEEL
Turn the dial up before your shower, flip it off when you leave for the day. Floor surface reaches 80-85°F at typical setpoints. Energy use is small for a bathroom this size — roughly 5-7 kWh/month at typical usage (≈ $1-2/month).`

    const newNotes = baseNotes + newAddendum

    await db.query(
      `UPDATE jobs SET line_items = $1::jsonb, scope_notes = $2, estimated_cost = $3, estimated_days = $4 WHERE id = $5`,
      [JSON.stringify(newItems), newNotes, newCost, newDays, JOB_ID]
    )
    await db.query('COMMIT')

    console.log('\n========================================')
    console.log('UPDATED Dutch job #62 (Ditra-Heat → pass-through pricing)')
    console.log('  Heated materials (pass-through @ F&D + MA tax):')
    console.log('    Membrane (6 sheets): $' + membraneAmount.toFixed(2))
    console.log('    Cable (32 sf 120V):  $' + CABLE_PRICE.toFixed(2))
    console.log('    Thermostat (non-prog): $' + THERMOSTAT_PRICE.toFixed(2))
    console.log('  Labor (flat):          $' + WIRE_LABOR.toFixed(2))
    console.log('  Added: $' + addedAmount.toFixed(2) + ', Removed prior: $' + removedAmount.toFixed(2))
    console.log('  Line items: ' + oldItems.length + ' → ' + newItems.length)
    console.log('  Cost:  $' + oldCost.toFixed(2) + ' → $' + newCost.toFixed(2) + ' (' + (newCost > oldCost ? '+' : '') + '$' + (newCost - oldCost).toFixed(2) + ')')
    console.log('  Days:  ' + oldDays + ' → ' + newDays)
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
