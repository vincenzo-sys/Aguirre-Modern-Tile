// Bump Cam Howard's labor rates to $1000/day for both demo and install across
// both scopes. Aligns with the standard Aguirre 2-man crew day rate.

import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const JOB_ID = '415a8956-0d9b-47f3-90f2-c428406c2d44'
const NEW_DAY_RATE = 1000

async function loadEnv() {
  const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

async function main() {
  await loadEnv()
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: job, error: fetchErr } = await sb
    .from('jobs')
    .select('line_items, estimated_cost, margin_percent')
    .eq('id', JOB_ID)
    .single()
  if (fetchErr) throw new Error('Fetch failed: ' + fetchErr.message)

  const oldRevenue = Number(job.estimated_cost)
  const oldMarginDollars = oldRevenue * (Number(job.margin_percent) / 100)
  let laborDelta = 0
  const touched = []

  // Match labor rows by description prefix — covers both "Demolition —" and
  // "Installation —" rows across both scopes, leaves trash/travel alone.
  const lineItems = job.line_items.map((li) => {
    const desc = li.description || li.name || ''
    const isCrewDay = li.category === 'labor' && (/^Demolition/.test(desc) || /^Installation/.test(desc))
    if (!isCrewDay) return li
    const qty = Number(li.quantity ?? 1)
    const oldAmount = Number(li.amount ?? 0)
    const newAmount = NEW_DAY_RATE * qty
    laborDelta += newAmount - oldAmount
    touched.push(`${li.section}: ${desc.split(' — ')[0]}  $${li.unit_price} → $${NEW_DAY_RATE}  (${qty} days)`)
    return { ...li, unit_price: NEW_DAY_RATE, amount: newAmount }
  })

  const newEstimatedCost = lineItems.reduce((s, li) => s + Number(li.amount ?? 0), 0)
  // Labor rate increase is pure revenue (crew cost is fixed) → all delta flows to margin.
  const newMarginDollars = oldMarginDollars + laborDelta
  const newMarginPercent = Math.round((newMarginDollars / newEstimatedCost) * 1000) / 10

  const { error: updErr } = await sb
    .from('jobs')
    .update({
      line_items: lineItems,
      estimated_cost: newEstimatedCost,
      margin_percent: newMarginPercent,
    })
    .eq('id', JOB_ID)
  if (updErr) throw new Error('Update failed: ' + updErr.message)

  console.log('========================================')
  console.log('UPDATED — Cam Howard, job #69')
  for (const t of touched) console.log('  ' + t)
  console.log('  Labor delta:     +$' + laborDelta.toFixed(2))
  console.log('  New total:       $' + newEstimatedCost.toFixed(2))
  console.log('  New deposit:     $' + (newEstimatedCost * 0.1).toFixed(2))
  console.log('  New margin:      ' + newMarginPercent + '%')
  console.log('========================================')
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
