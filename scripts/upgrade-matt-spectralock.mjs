// One-shot: upgrade Matt Metelitsa job #5 from standard cement grout to
// Laticrete SpectraLock PRO Premium epoxy grout + add 1 day of labor
// for the slower install pace epoxy grout requires.
//
// Also seeds SpectraLock Part AB + Part C as materials_pricing rows so
// the DB is current for future jobs that spec epoxy grout.
//
// F&D pricing verified 2026-05-15:
//   Part AB (4 lb / 4-5 gal unit, 162 sf max coverage): $101.00
//   Part C  (9 lb colored powder, 140 sf max coverage): $20.80
//   One "complete kit" = AB + C = $121.80 cost / $146.16 customer
//   (20% markup, matching the rest of the Laticrete line)
//
// Matt's job: ~437 sf total tile (3 showers × 95 + 152 floor) needs
// 3.1 kits at 140 sf coverage. Specing 5 kits (1 per shower + 2 for
// floor bundle) — mirrors the existing per-scope grout structure with
// a small safety margin. Same color across all 7 scopes.

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
    await db.query('BEGIN')

    // ── 1. Seed SpectraLock materials in materials_pricing (idempotent) ──
    const existAB = await db.query(
      `SELECT id FROM materials_pricing WHERE item = $1`,
      ['Laticrete SpectraLock PRO Premium Grout — Part AB (4 lb / 4-5 gal unit)']
    )
    if (existAB.rowCount === 0) {
      await db.query(
        `INSERT INTO materials_pricing (item, category, your_cost, markup_percent, price_to_customer, coverage, unit, retail_link)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          'Laticrete SpectraLock PRO Premium Grout — Part AB (4 lb / 4-5 gal unit)',
          'Grout',
          101.00,
          0.20,
          121.20,
          162.00,
          'per piece',
          'https://www.flooranddecor.com/tile-grout-installation-materials/laticrete-spectralock-pro-premium-grout-part-ab-100897412.html',
        ]
      )
      console.log('Seeded materials_pricing: SpectraLock Part AB')
    }
    const existC = await db.query(
      `SELECT id FROM materials_pricing WHERE item = $1`,
      ['Laticrete SpectraLock PRO Premium Grout — Part C (9 lb colored powder, color per customer)']
    )
    if (existC.rowCount === 0) {
      await db.query(
        `INSERT INTO materials_pricing (item, category, your_cost, markup_percent, price_to_customer, coverage, unit, retail_link)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          'Laticrete SpectraLock PRO Premium Grout — Part C (9 lb colored powder, color per customer)',
          'Grout',
          20.80,
          0.20,
          24.96,
          140.00,
          'per piece',
          'https://www.flooranddecor.com/tile-grout-installation-materials/laticrete-60-dusty-gray-spectralock-part-c-100898014.html',
        ]
      )
      console.log('Seeded materials_pricing: SpectraLock Part C')
    }

    // ── 2. Update Matt's job line items ──────────────────────────────
    const cur = await db.query(
      `SELECT line_items, estimated_cost, estimated_days, scope_notes FROM jobs WHERE id = $1`,
      [JOB_ID]
    )
    const oldItems = cur.rows[0].line_items
    const oldCost = Number(cur.rows[0].estimated_cost)
    const oldDays = Number(cur.rows[0].estimated_days)
    const oldNotes = cur.rows[0].scope_notes ?? ''

    if (oldItems.some((li) => li.description && li.description.includes('SpectraLock'))) {
      await db.query('ROLLBACK')
      console.log('SpectraLock already added — bailing.')
      return
    }

    // Strip all standard-grout line items
    const removedGroutItems = oldItems.filter(
      (li) => li.description && li.description.match(/^Grout 25 lb/i)
    )
    const removedGroutAmount = removedGroutItems.reduce((s, li) => s + Number(li.amount), 0)
    const keepItems = oldItems.filter(
      (li) => !(li.description && li.description.match(/^Grout 25 lb/i))
    )
    console.log('Removed ' + removedGroutItems.length + ' standard-grout lines totaling $' + removedGroutAmount.toFixed(2))

    // Append the SpectraLock bundled line + extra labor day
    const KITS = 5
    const PER_KIT_CUSTOMER = 146.16 // $121.20 (AB) + $24.96 (C)
    const spectraTotal = Number((KITS * PER_KIT_CUSTOMER).toFixed(2))
    const newItems = [
      ...keepItems,
      {
        category: 'materials',
        section: 'Upgrade — Epoxy grout',
        description:
          'Laticrete SpectraLock PRO Premium epoxy grout — 5 complete kits (Part AB resin/hardener + Part C colored powder in color of customer\'s choice). Covers all 3 showers + 4 floors (~437 sf total tile, single batch for consistent color across the whole job). Premium upgrade vs cement grout: stain-resistant, color-fast, mold/mildew-resistant, lifetime warranty from Laticrete.',
        quantity: KITS,
        unit: 'kit',
        unit_price: PER_KIT_CUSTOMER,
        amount: spectraTotal,
      },
      {
        category: 'labor',
        section: 'Upgrade — Epoxy grout',
        description:
          'Additional install day — epoxy grout requires smaller working sections (30-min pot life), 2× cleanup time per sf (water + vinegar second wipe per Laticrete spec), and cannot be left in joints overnight. One day across the whole project (showers + floors).',
        quantity: 1,
        unit: 'day',
        unit_price: 1000,
        amount: 1000,
      },
    ]

    const newCost = Number((oldCost - removedGroutAmount + spectraTotal + 1000).toFixed(2))
    const newDays = oldDays + 1

    // ── 3. Append scope_notes section ────────────────────────────────
    const notesAddendum = `

═══════════════════════════════════════════════
UPGRADED 2026-05-15 — EPOXY GROUT (Laticrete SpectraLock PRO Premium)

Replaced standard cement grout with Laticrete SpectraLock PRO Premium epoxy grout across the entire job (all 3 showers + 4 floors, ~437 sf total tile area). Single color batch across the whole project for visual consistency.

WHY EPOXY GROUT
  • Stain-resistant — won't absorb wine, coffee, dirt the way cement grout does
  • Color-fast — won't darken or yellow over time
  • Mold/mildew-resistant — critical in wet shower environments
  • No sealing required (ever) — cement grout needs resealing every 1-2 years
  • Lifetime warranty from Laticrete vs. typical 25-year on cement grout

WHAT WE'RE USING
  5 complete kits of Laticrete SpectraLock PRO Premium Grout:
    • Part AB (resin + hardener, 4 lb / 4-5 gal unit each): 5 units
    • Part C (colored powder, 9 lb each, color per your selection): 5 units
  At ~140 sf coverage per kit, 5 kits comfortably covers ~700 sf of tile — plenty of safety margin against waste, plus same color batch keeps grout joints visually identical across all 7 scopes.

EXTRA INSTALL DAY (+1)
Epoxy grout requires a slower, more careful install:
  • 30-minute pot life (must mix small batches, work fast)
  • 2× cleanup time per sf (mandatory water + vinegar second wipe per Laticrete spec)
  • Cannot be left in joints overnight — must be cleaned the same working day
One additional install day added across the whole project to account for this.

COLOR SELECTION
Please pick a Laticrete SpectraLock color from their swatch chart (40+ colors available). Common choices for white/light tile: Bright White (#44), Frosty (#09), Silver Shadow (#89). For darker tile: Dusty Gray (#60), Midnight Black (#22).`

    await db.query(
      `UPDATE jobs
       SET line_items = $1::jsonb,
           scope_notes = $2,
           estimated_cost = $3,
           estimated_days = $4
       WHERE id = $5`,
      [JSON.stringify(newItems), oldNotes + notesAddendum, newCost, newDays, JOB_ID]
    )
    await db.query('COMMIT')

    console.log('\n========================================')
    console.log('UPDATED job', JOB_ID)
    console.log('  Removed:    ' + removedGroutItems.length + ' standard-grout lines (-$' + removedGroutAmount.toFixed(2) + ')')
    console.log('  Added:      1 SpectraLock line ($' + spectraTotal.toFixed(2) + ' = 5 kits × $' + PER_KIT_CUSTOMER + ')')
    console.log('  Added:      1 extra install day ($1,000)')
    console.log('  Line items: ' + oldItems.length + ' → ' + newItems.length + ' (' + (newItems.length - oldItems.length) + ')')
    console.log('  Cost:       $' + oldCost.toFixed(2) + ' → $' + newCost.toFixed(2) + ' (+$' + (newCost - oldCost).toFixed(2) + ')')
    console.log('  Days:       ' + oldDays + ' → ' + newDays)
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
