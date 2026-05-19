// Dutch (job #62, Swampscott): swap Strata Mat for the full Schluter
// Ditra-Heat heated-floor system on the bathroom floor.
//
// Adds the membrane + 120V cable + WiFi thermostat + 0.5 install day
// for the heated-floor work (cable layout, ohm testing pre/post tile,
// thermostat low-voltage hookup). The 240V/120V high-side hookup stays
// out of scope — customer's electrician handles line voltage + GFCI.
//
// Also seeds 2 new materials_pricing rows verified against F&D
// 2026-05-19 (membrane sheet + 32 sf 120V cable). The WiFi thermostat
// is already in materials_pricing.
//
// Floor revised: 40 → 48 sf per Vince on-site read 2026-05-19. Job's
// square_footage bumped 115 → 123 (70 walls + 48 + 5 sf misc rounded
// up). Strata Mat line removed; thinset & GoBoard counts untouched
// because the +8 sf floor falls inside formula clamps.

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const JOB_ID = '7a3536b4-0461-4d8b-9949-1213cd3da60d'

// Verified F&D prices (2026-05-19):
const MEMBRANE_COST = 24.90       // per 8.6 sf sheet
const CABLE_32_COST = 339.80      // 32 sf 120V cable
const MARKUP = 1.20
const MEMBRANE_CUST = Number((MEMBRANE_COST * MARKUP).toFixed(2))  // 29.88
const CABLE_32_CUST = Number((CABLE_32_COST * MARKUP).toFixed(2))  // 407.76
const THERMOSTAT_CUST = 454.00    // from materials_pricing (already there)

const MEMBRANE_SHEETS = 6         // 6 × 8.6 = 51.6 sf, covers 48 sf floor + waste
const LABOR_HALF_DAY = 525        // 0.5 × $1050 install rate matching existing line

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

    // ── 1. Seed materials_pricing (idempotent) ───────────────────────
    const membraneItem = 'Schluter Ditra-Heat Membrane Sheet (39in x 31in, 8.6 sqft)'
    const cableItem = 'Schluter Ditra-Heat 120V Heating Cable (32 sqft coverage)'
    const cur = await db.query(`SELECT item FROM materials_pricing WHERE item IN ($1, $2)`, [membraneItem, cableItem])
    const haveMembrane = cur.rows.some((r) => r.item === membraneItem)
    const haveCable = cur.rows.some((r) => r.item === cableItem)
    if (!haveMembrane) {
      await db.query(
        `INSERT INTO materials_pricing (item, category, your_cost, markup_percent, price_to_customer, coverage, unit, retail_link)
         VALUES ($1, 'Heating', $2, 0.20, $3, 8.6, 'per piece', $4)`,
        [membraneItem, MEMBRANE_COST, MEMBRANE_CUST, 'https://www.flooranddecor.com/floor-warming-systems-trending-installation-materials/schluter-ditra-heat-membrane-sheets-100055409.html']
      )
      console.log('Seeded materials_pricing: ' + membraneItem)
    }
    if (!haveCable) {
      await db.query(
        `INSERT INTO materials_pricing (item, category, your_cost, markup_percent, price_to_customer, coverage, unit, retail_link)
         VALUES ($1, 'Heating', $2, 0.20, $3, 32.0, 'per piece', $4)`,
        [cableItem, CABLE_32_COST, CABLE_32_CUST, 'https://www.flooranddecor.com/floor-warming-systems-trending-installation-materials/schluter-32sqft.-ditra-heat-120v-heating-cable-100055367.html']
      )
      console.log('Seeded materials_pricing: ' + cableItem)
    }

    // ── 2. Read current job ──────────────────────────────────────────
    const jobRes = await db.query(
      `SELECT line_items, estimated_cost, estimated_days, square_footage, scope_notes FROM jobs WHERE id = $1`,
      [JOB_ID]
    )
    const oldItems = jobRes.rows[0].line_items
    const oldCost = Number(jobRes.rows[0].estimated_cost)
    const oldDays = Number(jobRes.rows[0].estimated_days)
    const oldSqft = Number(jobRes.rows[0].square_footage)
    const oldNotes = jobRes.rows[0].scope_notes ?? ''

    if (oldItems.some((li) => li.description && li.description.includes('Ditra-Heat'))) {
      await db.query('ROLLBACK')
      console.log('Ditra-Heat already on this job — bailing.')
      return
    }

    // ── 3. Rewrite line items: remove Strata Mat, add Ditra-Heat stack
    const removedStrata = oldItems.find((li) => li.description && li.description.includes('Strata Mat'))
    const keptItems = oldItems.filter((li) => !(li.description && li.description.includes('Strata Mat')))
    const removedAmount = removedStrata ? Number(removedStrata.amount) : 0
    console.log(`Removing Strata Mat: $${removedAmount.toFixed(2)}`)

    const ditraHeatLines = [
      {
        category: 'materials',
        section: 'Heated floor upgrade',
        description: 'Schluter Ditra-Heat membrane sheets (8.6 sf each) — uncoupling + integrated heating-cable channels. Replaces Strata Mat for the heated floor build. 6 sheets covers 48 sf floor with cut waste.',
        quantity: MEMBRANE_SHEETS,
        unit: 'sheet',
        unit_price: MEMBRANE_CUST,
        amount: Number((MEMBRANE_SHEETS * MEMBRANE_CUST).toFixed(2)),
      },
      {
        category: 'materials',
        section: 'Heated floor upgrade',
        description: 'Schluter Ditra-Heat 120V heating cable (32 sf coverage). Sized for ~30 sf heatable area (floor minus vanity + toilet footprints). 120V means standard residential wiring — no dedicated 240V breaker required.',
        quantity: 1,
        unit: 'ea',
        unit_price: CABLE_32_CUST,
        amount: CABLE_32_CUST,
      },
      {
        category: 'materials',
        section: 'Heated floor upgrade',
        description: 'Schluter Ditra-Heat-E-WiFi Thermostat — programmable, app-controlled, with floor sensor. We install the box and connect the floor sensor; electrician wires the 120V line side.',
        quantity: 1,
        unit: 'ea',
        unit_price: THERMOSTAT_CUST,
        amount: THERMOSTAT_CUST,
      },
      {
        category: 'labor',
        section: 'Heated floor upgrade',
        description: 'Additional install labor — heated-floor work: cable layout in membrane channels, ohm-test before AND after tile install (Schluter warranty requirement), thermostat box install + floor sensor hookup, coordination with customer\'s electrician on line-voltage connection.',
        quantity: 0.5,
        unit: 'day',
        unit_price: 1050,
        amount: LABOR_HALF_DAY,
      },
    ]
    const addedAmount = ditraHeatLines.reduce((s, li) => s + Number(li.amount), 0)
    const newItems = [...keptItems, ...ditraHeatLines]
    const newCost = Number((oldCost - removedAmount + addedAmount).toFixed(2))

    // ── 4. Append scope_notes section ────────────────────────────────
    const newSqft = 70 + 48 + 5  // walls + revised floor + 5 sf misc/threshold
    const notesAddendum = `

═══════════════════════════════════════════════
UPGRADED 2026-05-19 — HEATED BATHROOM FLOOR (Schluter Ditra-Heat)

Replacing Strata Mat with the full Schluter Ditra-Heat system so the bathroom floor stays warm year-round. Same Schluter family — uncoupling membrane + integrated heating-cable channels — but with 120V cable + WiFi-programmable thermostat. Lifetime warranty on the membrane, 5-year on the cable (Schluter warranty when installed to spec; we are spec-certified).

WHAT WE'RE ADDING
  • Schluter Ditra-Heat membrane (6 sheets × 8.6 sf = 51.6 sf coverage) — covers the full bathroom floor (~48 sf measured) with cut waste
  • Schluter Ditra-Heat 120V heating cable, 32 sf coverage — heats the open floor area (excludes under vanity + toilet, where heat would be wasted or unsafe per Schluter spec)
  • Schluter Ditra-Heat-E-WiFi programmable thermostat — app-controlled, with floor temperature sensor
  • Additional 0.5 install day for cable layout, ohm testing (Schluter warranty requires resistance check before AND after tile install), thermostat box install, and electrician coordination

FLOOR AREA NOTE
Your RFQ described the floor as 6 ft × 5.5 ft (~33 sf). On-site measurement places it closer to 48 sf — likely including doorway/threshold area or rounding. Cable is sized for the heatable area (~30 sf) regardless; the floor sqft drives the membrane count.

ELECTRICAL — STILL OUT OF OUR SCOPE
The 120V cable runs on a standard residential circuit. Easier than 240V — no dedicated breaker needed — but the line-voltage hookup is still your electrician's job:
  • Run a 120V line to the thermostat location (typically next to the light switch by the bathroom door)
  • GFCI-protect the heating circuit (NEC requirement)
  • Connect line voltage to the thermostat box we install
  • Test final continuity

We can recommend an electrician if you don't have one. Total electrician cost typically $200-350 for this scope.

WARRANTY HANDOFF
We register the Ditra-Heat installation with Schluter on completion. You get:
  • Lifetime warranty on the membrane
  • 5-year warranty on the heating cable (covers replacement cable + tear-out & reinstall labor for the heated area)
  • 3-year Aguirre Modern Tile warranty on installation labor (everything else)

HOW THE FLOOR WILL FEEL
Programmable schedule via the WiFi app — set it warm for morning shower, off during the day, on again in the evening. Floor surface reaches 80-85°F at typical setpoints. Energy use is small for a bathroom this size — roughly 5-7 kWh/month at typical usage (≈ $1-2/month).`

    await db.query(
      `UPDATE jobs SET line_items = $1::jsonb, scope_notes = $2, estimated_cost = $3, estimated_days = $4, square_footage = $5 WHERE id = $6`,
      [JSON.stringify(newItems), oldNotes + notesAddendum, newCost, oldDays + 1, newSqft, JOB_ID]
    )
    await db.query('COMMIT')

    console.log('\n========================================')
    console.log('UPDATED Dutch job #62')
    console.log('  Removed: 1 Strata Mat line (-$' + removedAmount.toFixed(2) + ')')
    console.log('  Added:   4 Ditra-Heat lines (+$' + addedAmount.toFixed(2) + ')')
    console.log('  Line items: ' + oldItems.length + ' → ' + newItems.length)
    console.log('  Cost:    $' + oldCost.toFixed(2) + ' → $' + newCost.toFixed(2) + ' (+$' + (newCost - oldCost).toFixed(2) + ')')
    console.log('  Days:    ' + oldDays + ' → ' + (oldDays + 1) + ' (rounding +0.5)')
    console.log('  sqft:    ' + oldSqft + ' → ' + newSqft + ' (floor 40 → 48)')
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
