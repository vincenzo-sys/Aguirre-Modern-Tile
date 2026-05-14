// One-shot orchestration: create Teresa Budd as a customer + a job under
// the new Walk-in Shower (Traditional Schluter) template, call the dashboard
// estimator to fill in line items via the canonical engine, add the niche
// addon as a custom line item (not modeled in the template), bump the totals,
// and generate the public estimate URL.
//
// Usage:  node scripts/create-teresa.mjs
// Requires: dev server running on port 3100 with TILE_API_KEY in env.

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const PORT = 3100
const API_BASE = `http://localhost:${PORT}`

async function loadEnv() {
  const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

async function main() {
  await loadEnv()
  const apiKey = process.env.TILE_API_KEY
  if (!apiKey) throw new Error('TILE_API_KEY missing from .env.local')

  const db = new pg.Client({ connectionString: process.env.DATABASE_URI, ssl: { rejectUnauthorized: false } })
  await db.connect()

  try {
    // ── 1. Find-or-create customer Teresa Budd ─────────────────────────
    let custId
    const existing = await db.query(
      `SELECT id FROM customers WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      ['teresa.budd@gmail.com']
    )
    if (existing.rows[0]) {
      custId = existing.rows[0].id
      console.log('[1/5] Customer already exists, reusing id:', custId)
    } else {
      const ins = await db.query(
        `INSERT INTO customers (name, email, address, city, state, zip, source, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          'Teresa Budd',
          'teresa.budd@gmail.com',
          '477 E 4th Street',
          'South Boston',
          'MA',
          '02127',
          'website',
          'Phone TBD. Email RFQ received 2026-05-14 with PDF scope: shower re-tile, traditional Schluter build (cement board + Kerdi membrane + mud pack), customer supplies tile + threshold + glass doors.',
        ]
      )
      custId = ins.rows[0].id
      console.log('[1/5] Customer created:', custId)
    }

    // ── 2. Create the stub job ─────────────────────────────────────────
    const scopeNotes = `WALK-IN SHOWER RE-TILE — Traditional Schluter Build

Demo existing tiled shower (walls, mud bed, curb, door). Frame new 4" curb. Build per customer's RFQ spec:
  • Walls (~80 sqft): Cement board + Schluter Kerdi waterproofing membrane + Kerdi-Band at all corners/transitions. Customer-supplied 24x48 Perla Venata polished porcelain.
  • Shower floor (~12.6 sqft, 31.5" x 57.5"): Mapei 4-to-1 deck mud pre-slope + Kerdi membrane + new center Schluter Kerdi-Drain. Customer-supplied Capri Almond hex mosaic.
  • Step/curb (5-3/4" → new 4" wide, 33.5" long): Framed, cement board, Kerdi, tiled.
  • (1) Custom Schluter Kerdi-Box niche, ~12x16, customer-supplied stone shelf/sill.
  • Ivory Engineered Stone Threshold (4" x 36"), customer-supplied, we set on top of step.
  • Stain-resistant grout in warm beige (we supply).

CUSTOMER PROVIDES: Wall tile (Perla Venata 24x48), floor mosaic (Capri Almond hex), niche stone, threshold, frameless hinged glass doors (Aston Kinkade XL, customer arranges install with glass shop).

NOT INCLUDED:
  • Plumbing — drain relocation from existing linear to new center Kerdi-Drain (Avery / All Things Plumbing referral if needed).
  • Glass shower door install — we do not install glass; customer arranges with glass shop.
  • Self-leveling compound if subfloor requires it (assessed at demo).

WARRANTY: 3 years on installation labor.`

    const jobIns = await db.query(
      `INSERT INTO jobs (
         title, status, client_name, client_email, client_address,
         customer_id, job_type, square_footage, scope_notes
       )
       VALUES ($1, 'lead', $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, job_number`,
      [
        'Teresa Budd — Shower Re-tile (South Boston)',
        'Teresa Budd',
        'teresa.budd@gmail.com',
        '477 E 4th Street, South Boston, MA 02127',
        custId,
        'Bathroom',
        92.6,
        scopeNotes,
      ]
    )
    const jobId = jobIns.rows[0].id
    const jobNumber = jobIns.rows[0].job_number
    console.log('[2/5] Job created — id:', jobId, 'job #:', jobNumber)

    // ── 3. Generate estimate via canonical dashboard API ──────────────
    const generateRes = await fetch(`${API_BASE}/api/estimates/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({
        job_id: jobId,
        scopes: [
          {
            label: 'Walk-in Shower — Traditional Schluter',
            template_name: 'Walk-in Shower (Traditional Schluter)',
            sub_sqft: { walls: 80, shower_floor: 12.6, outside_floor: 0 },
            addons: { has_curb: true, large_format: true },
            customer_provides: [
              'Wall tile (24x48 Perla Venata)',
              'Floor mosaic (Capri Almond hex)',
              'Stone niche sill/shelf',
              '4x36 ivory engineered stone threshold',
              'Frameless glass shower doors (Aston Kinkade XL)',
            ],
          },
        ],
        warranty_years: 3,
        overwrite: true,
      }),
    })
    const generateJson = await generateRes.json()
    if (!generateRes.ok) {
      throw new Error(`Estimate generate failed: ${JSON.stringify(generateJson)}`)
    }
    console.log('[3/5] Estimator ran — summary:', JSON.stringify(generateJson.summary, null, 2))

    // ── 4. Append niche addon as a custom line item ────────────────────
    // The template doesn't model niches (intentional — niches are per-job
    // and live in the add_ons table). Direct line-item append + total bump.
    const jobNow = await db.query(
      `SELECT line_items, estimated_cost FROM jobs WHERE id = $1`,
      [jobId]
    )
    const lineItems = jobNow.rows[0].line_items
    const existingTotal = Number(jobNow.rows[0].estimated_cost)

    const nicheLine = {
      category: 'labor',
      section: 'Walk-in Shower — Traditional Schluter',
      description: 'Custom Niche Install (framed + waterproofed + tiled; customer-supplied stone sill/shelf set)',
      quantity: 1,
      unit: 'ea',
      unit_price: 400,
      amount: 400,
    }
    const newItems = [...lineItems, nicheLine]
    const newTotal = existingTotal + 400
    // Margin: niche labor at 50% margin (Vince's standard for niche addon)
    // means $200 profit on $400 → recalc would be complex; we update estimated_cost
    // and let the dashboard re-display. margin_percent stays close to template default.
    const newMargin = Number(((newTotal - (newTotal * (1 - Number(jobNow.rows[0].estimated_cost ? 0.4 : 0.4)))) / newTotal * 100).toFixed(2))

    await db.query(
      `UPDATE jobs SET line_items = $1::jsonb, estimated_cost = $2 WHERE id = $3`,
      [JSON.stringify(newItems), newTotal, jobId]
    )
    console.log('[4/5] Added niche line item ($400). New total: $' + newTotal.toFixed(2))

    // ── 5. Generate the customer-facing estimate URL ───────────────────
    const linkRes = await fetch(`${API_BASE}/api/jobs/${jobId}/estimate-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    })
    const linkJson = await linkRes.json()
    if (!linkRes.ok) throw new Error(`Estimate link failed: ${JSON.stringify(linkJson)}`)
    console.log('[5/5] Estimate URL:', linkJson.url)

    console.log('\n========================================')
    console.log('DONE.')
    console.log('  Customer:    Teresa Budd  (' + custId + ')')
    console.log('  Job #:       ' + jobNumber + '  (' + jobId + ')')
    console.log('  Total:       $' + newTotal.toFixed(2))
    console.log('  Estimate URL: ' + linkJson.url)
    console.log('  Dashboard:   /dashboard/jobs/' + jobId)
    console.log('========================================')
  } finally {
    await db.end()
  }
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
