// One-shot: create customer Cam Howard (referral from Avery the plumber),
// create a job at 58 Campus Road Methuen MA, and run the canonical estimator
// against two scopes — shower remodel + bathroom floor — so Cam sees them
// as separately-totaled quotes on one estimate URL.

import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

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
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  {
    // Find or create the customer. Email is unique enough to dedupe on.
    let customerId
    const { data: existing } = await sb
      .from('customers')
      .select('id')
      .eq('email', 'chowzz93@gmail.com')
      .maybeSingle()
    if (existing) {
      customerId = existing.id
      console.log('[0/4] Customer already exists:', customerId)
    } else {
      const { data: cust, error: ce } = await sb
        .from('customers')
        .insert({
          name: 'Cam Howard',
          email: 'chowzz93@gmail.com',
          address: '58 Campus Road',
          city: 'Methuen',
          state: 'MA',
          source: 'referral',
          notes: 'Referred by Avery the plumber.',
        })
        .select('id')
        .single()
      if (ce) throw new Error('Customer insert failed: ' + ce.message)
      customerId = cust.id
      console.log('[0/4] Customer created:', customerId)
    }

    // Refuse to double-create a job for this customer in the same session.
    const { data: dup } = await sb
      .from('jobs')
      .select('id, job_number')
      .eq('customer_id', customerId)
      .ilike('title', '%Howard%')
      .maybeSingle()
    if (dup) {
      console.log('Cam already has a job:', dup)
      return
    }

    const scopeNotes = `SCOPE OF WORK — Shower remodel + bathroom floor (two scopes, one job)

Existing setup (from photos): fiberglass/acrylic shower stall with glass sliding doors, folding seat, and grab bars sits in a ~60 in × 32 in alcove. Bathroom floor outside the shower is existing hex tile.

SCOPE 1 — Shower remodel (~89 sf)
  • Demo: remove existing fiberglass/acrylic pan + walls + glass doors + grab bars + window trim inside shower.
  • Walls (~75 sf, GoBoard backer over 3 walls, tub-rim to ceiling): 254 Platinum thinset, customer-supplied tile, sealed at seams + corners.
  • Shower floor (~14 sf): Kerdi tray (or mud-pack equivalent) + waterproofed drain. Customer-supplied tile.
  • Includes plumbing valve cut-around + niche framing if customer wants one (see addons).

SCOPE 2 — Bathroom floor (~35 sf)
  • Demo: pull existing hex tile floor.
  • Strata Mat uncoupling membrane (Laticrete) over the subfloor.
  • Dual-thinset bond per spec — 254 Platinum under the membrane, 253 Gold tile-to-membrane.
  • Customer-supplied tile + grout (we supply grout).
  • Toilet pull + reset, work-around vanity.

WARRANTY
3 years on installation labor. If tile cracks, loosens, or grout fails due to installation defects within 3 years of completion, we repair at no cost.

WHAT WE PROVIDE
  • Demo of existing shower + bathroom floor
  • GoBoard + waterproofing sealant + caps/screws (shower walls)
  • Kerdi tray (or mud-pack) + drain (shower floor)
  • Strata Mat uncoupling membrane (bathroom floor)
  • All setting materials: 254 Platinum thinset, 253 Gold thinset, grout, caulk
  • Trash haul-off and one trip charge for the whole project
  • Toilet pull + reset (for floor access)

NOT INCLUDED (out of our scope — tile only)
  • Plumbing trim — new shower valve, spout, supply lines, drain rough-in changes (refer to Avery / All Things Plumbing).
  • Glass shower door or hardware — customer to source / coordinate after tile.
  • Drywall repair or paint above tile line.
  • Electrical, ventilation, light fixtures.
  • Self-leveling compound if subfloor is found bouncy or out of plane at demo (assessed on-site).
  • Vanity removal (we work around it).

SEQUENCING
  1. Day 0 (plumber): rough plumbing changes if any (valve relocation, drain).
  2. Days 1-5 (us): demo, GoBoard, waterproof, tile shower walls + shower floor + bathroom floor, grout, caulk.
  3. Plumber returns for valve trim + spout once tile is set.
  4. Glass installer (customer-coordinated) takes final shower opening measurements after our tile is grouted.

ESTIMATE NOTES — referral
  • Referral source: Avery the plumber. Will coordinate plumbing scope directly.
  • Sqft estimates above are from photos; on-site measurement may shift 10-15% either way. Pricing won't change unless materially different.
  • Pricing assumes standard tile (12 in or smaller on the long side). If Cam picks a 12×24 or larger format on the bathroom floor, thinset stays the same; on the shower walls, this is already pre-quoted on 254 Platinum.`

    // Create the job
    const { data: jobIns, error: je } = await sb
      .from('jobs')
      .insert({
        title: 'Cam Howard — Shower remodel + bathroom floor',
        status: 'lead',
        client_name: 'Cam Howard',
        client_email: 'chowzz93@gmail.com',
        client_address: '58 Campus Road, Methuen, MA',
        customer_id: customerId,
        job_type: 'Bathroom',
        square_footage: 124, // 89 (shower) + 35 (floor)
        scope_notes: scopeNotes,
      })
      .select('id, job_number')
      .single()
    if (je) throw new Error('Job insert failed: ' + je.message)
    const jobId = jobIns.id
    const jobNumber = jobIns.job_number
    console.log('[1/4] Job created — #' + jobNumber + ' (' + jobId + ')')

    // Run the canonical estimator — two scopes so Cam sees primary + secondary
    // as separately-totaled sections on the estimate URL.
    const res = await fetch(`${API_BASE}/api/estimates/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({
        job_id: jobId,
        scopes: [
          {
            label: 'Shower remodel (demo + walls + floor)',
            template_name: 'Walk-in Shower (Small)',
            sqft: 89,
            sub_sqft: { walls: 75, shower_floor: 14, outside_floor: 0 },
            addons: { large_format: false },
            customer_provides: ['tile'],
          },
          {
            label: 'Bathroom floor (outside the shower)',
            template_name: 'Bathroom Floor (Small)',
            sqft: 35,
            customer_provides: ['tile'],
          },
        ],
        warranty_years: 3,
        overwrite: true,
      }),
    })
    const j = await res.json()
    if (!res.ok) throw new Error(`Estimate generate failed: ${JSON.stringify(j)}`)
    console.log('[2/4] Estimator ran — summary:')
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
    console.log('  Customer:    Cam Howard')
    console.log('  Email:       chowzz93@gmail.com')
    console.log('  Address:     58 Campus Road, Methuen, MA')
    console.log('  Referral:    Avery the plumber')
    console.log('  Job #:       ' + jobNumber + '  (' + jobId + ')')
    console.log('  Total:       $' + Number(j.summary.total).toFixed(2))
    console.log('  Deposit:     $' + Number(j.summary.deposit).toFixed(2))
    console.log('  Days:        ' + j.summary.labor_days)
    console.log('  Margin:      ' + j.summary.margin_percent + '%')
    console.log('  Line items:  ' + j.summary.line_item_count + '  (' + j.summary.scope_count + ' scopes)')
    console.log('  URL:         ' + lj.url)
    console.log('  Dashboard:   /dashboard/jobs/' + jobId)
    console.log('========================================')
  }
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
