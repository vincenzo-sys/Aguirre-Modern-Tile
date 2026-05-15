// One-shot: create a job for Roger Babin (already added to customers
// 2026-05-15) and run the canonical estimator against the Tub Surround
// + Bathroom Floor template. No address yet, so transport will fall
// back to the operating_costs minimum.

import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const PORT = 3100
const API_BASE = `http://localhost:${PORT}`
const CUSTOMER_ID = 'f5bed6eb-acdd-41e9-bfad-a371e2afa548'

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
  const db = new pg.Client({ connectionString: process.env.DATABASE_URI, ssl: { rejectUnauthorized: false } })
  await db.connect()
  try {
    // Refuse to double-create a job for this customer in the same session.
    const dup = await db.query(
      `SELECT id, job_number FROM jobs WHERE customer_id = $1 AND title ILIKE '%Roger%'`,
      [CUSTOMER_ID]
    )
    if (dup.rows[0]) {
      console.log('Roger already has a job:', dup.rows[0])
      return
    }

    const scopeNotes = `SCOPE OF WORK — Tub Surround + Bathroom Floor

Existing acrylic tub + acrylic surround comes out (plumber). New tub goes in (plumber, customer-supplied tub). We then:
  • Wall scope (~75 sf): GoBoard backer over 3 walls around the new tub, sealed at seams. Customer-supplied tile installed full height (tub rim to ~6 ft / ceiling). Includes setting materials (thinset, grout, caulk).
  • Floor scope (~40 sf, customer's measurement): Demo existing tile floor. Strata Mat uncoupling membrane (Laticrete) over the subfloor. Dual-thinset bond per spec — 254 Platinum under the membrane, 253 Gold tile-to-membrane. Customer-supplied tile + grout (we supply grout).

Combined into a single combo template (Tub Surround + Bathroom Floor) so the same crew does both scopes in one continuous visit — saves a day vs running them as separate jobs.

WARRANTY
3 years on installation labor. If tile cracks, loosens, or grout fails due to installation defects within 3 years of completion, we repair at no cost.

WHAT WE PROVIDE
  • Demo of existing acrylic surround + old floor tile
  • GoBoard + waterproofing sealant + caps/screws (wet walls)
  • Strata Mat uncoupling membrane (floor)
  • All setting materials: 254 Platinum thinset, 253 Gold thinset, grout, caulk
  • Trash haul-off and one trip charge for the whole project
  • Toilet pull + reset (if needed for floor access)

NOT INCLUDED (out of our scope — tile only)
  • NEW TUB purchase + install — Refer to Avery / All Things Plumbing, (781) 654-5021. Roger pays plumber direct (~$600-900 for a basic tub swap-out, plus the tub itself).
  • Plumbing trim — shower valve, spout, supply lines (plumber).
  • Drain rough-in changes if the new tub footprint differs from the old.
  • Glass shower door or shower curtain rod / hardware.
  • Drywall repair or paint above the tile line.
  • Electrical, ventilation, light fixtures.
  • Self-leveling compound if subfloor is found bouncy or out of plane at demo (assessed on-site).
  • Vanity / pedestal sink removal (we work around them).

SEQUENCING — 2-trip choreography
  1. Day 0 (plumber): pulls old acrylic tub + surround, installs new tub.
  2. Days 1-4 (us): frame as needed, GoBoard 3 walls, waterproof, tile walls + floor, grout, caulk.
  3. Plumber returns for valve trim + spout once tile is set.

ESTIMATE NOTES
  • Wall sqft (~75) is a typical 3-wall tub niche estimate (5 ft wide × 5 ft tall × 3 walls). On-site measurement may shift this 10-15% either way; pricing won't change unless materially different.
  • Floor sqft (40) is Roger's measurement from voicemail.
  • Pricing assumes standard tile (12 in or smaller on the long side) — if Roger picks a 12×24 or larger format, thinset swaps from 253 Gold to 254 Platinum on the walls, adds about $90.`

    // Create the job
    const jobIns = await db.query(
      `INSERT INTO jobs (
         title, status, client_name, client_phone, customer_id, job_type, square_footage, scope_notes
       )
       VALUES ($1, 'lead', $2, $3, $4, $5, $6, $7)
       RETURNING id, job_number`,
      [
        'Roger Babin — Tub Surround + Bathroom Floor',
        'Roger Babin',
        '(603) 677-2575',
        CUSTOMER_ID,
        'Bathroom',
        115,
        scopeNotes,
      ]
    )
    const jobId = jobIns.rows[0].id
    const jobNumber = jobIns.rows[0].job_number
    console.log('[1/3] Job created — #' + jobNumber + ' (' + jobId + ')')

    // Run the canonical estimator
    const res = await fetch(`${API_BASE}/api/estimates/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({
        job_id: jobId,
        scopes: [
          {
            label: 'Tub Surround + Bathroom Floor',
            template_name: 'Tub Surround + Bathroom Floor',
            sqft: 115,
            sub_sqft: { walls: 75, bathroom_floor: 40 },
            addons: { large_format: false },
            customer_provides: ['tile'],
          },
        ],
        warranty_years: 3,
        overwrite: true,
      }),
    })
    const j = await res.json()
    if (!res.ok) throw new Error(`Estimate generate failed: ${JSON.stringify(j)}`)
    console.log('[2/3] Estimator ran — summary:')
    console.log(JSON.stringify(j.summary, null, 2))

    // Mint the estimate URL
    const link = await fetch(`${API_BASE}/api/jobs/${jobId}/estimate-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    })
    const lj = await link.json()
    if (!link.ok) throw new Error(`Estimate link failed: ${JSON.stringify(lj)}`)

    console.log('\n========================================')
    console.log('DONE.')
    console.log('  Customer:    Roger Babin')
    console.log('  Phone:       (603) 677-2575')
    console.log('  Job #:       ' + jobNumber + '  (' + jobId + ')')
    console.log('  Total:       $' + Number(j.summary.total).toFixed(2))
    console.log('  Deposit:     $' + Number(j.summary.deposit).toFixed(2))
    console.log('  Days:        ' + j.summary.labor_days)
    console.log('  Margin:      ' + j.summary.margin_percent + '%')
    console.log('  Line items:  ' + j.summary.line_item_count)
    console.log('  URL:         ' + lj.url)
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
