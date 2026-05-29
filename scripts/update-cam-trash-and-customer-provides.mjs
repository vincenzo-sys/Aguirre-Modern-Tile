// Apply two corrections to Cam Howard's estimate (job #69):
//   1. Trash/cleanup line bumps to $700 (more accurate for this gut shower
//      job — fiberglass pan + walls + glass + tile is a heavier haul than the
//      template default).
//   2. Customer also provides the stone piece for the shower curb. Vince's
//      pre-cut stock is $100 if Cam wants us to supply it instead.
//
// Side effects: estimated_cost gets the $400 trash delta; margin recomputed.

import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const JOB_ID = '415a8956-0d9b-47f3-90f2-c428406c2d44'

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
    .select('line_items, estimated_cost, margin_percent, scope_notes')
    .eq('id', JOB_ID)
    .single()
  if (fetchErr) throw new Error('Fetch failed: ' + fetchErr.message)

  // (1) Bump trash line $300 → $700.
  const NEW_TRASH = 700
  const OLD_TRASH = 300
  const TRASH_DELTA = NEW_TRASH - OLD_TRASH
  let trashTouched = false
  const lineItems = job.line_items.map((li) => {
    if (/cleanup|debris|trash/i.test(li.description || li.name || '')) {
      trashTouched = true
      return { ...li, unit_price: NEW_TRASH, amount: NEW_TRASH * (li.quantity ?? 1) }
    }
    return li
  })
  if (!trashTouched) throw new Error('No trash line found to update')

  // (2) Recompute estimated_cost from line items (sum of amounts) — safer than
  // adding the delta blindly in case anything else has drifted.
  const newEstimatedCost = lineItems.reduce((s, li) => s + Number(li.amount ?? 0), 0)

  // (3) Recompute margin. Old margin came from a stored revenue/cost split; we
  // only changed revenue here (trash $400 is pass-through-with-markup, treat as
  // pure margin add since the dump fee itself isn't broken out as a cost row).
  // newMargin = (oldMargin*oldRevenue + 400) / newRevenue
  const oldRevenue = Number(job.estimated_cost)
  const oldMarginDollars = oldRevenue * (Number(job.margin_percent) / 100)
  const newMarginDollars = oldMarginDollars + TRASH_DELTA
  const newMarginPercent = Math.round((newMarginDollars / newEstimatedCost) * 1000) / 10

  // (4) Update customer_provides to spell out the shower curb stone option.
  const customerProvides =
    'Tile (for shower walls, shower floor, and bathroom floor). Stone piece for the shower curb (Cam to supply, OR pick from our pre-cut stock for $100 added to this estimate).'

  // (5) Surface the curb-stone option in scope_notes so Cam reads it on the
  // estimate page, not just in the customer_provides side panel.
  const curbNote = `

WHO PROVIDES WHAT
  • Cam provides: tile for shower walls, shower floor, and bathroom floor.
  • Cam also provides the stone piece for the shower curb cap (one piece — either solid stone or a stone slab cut to size). If Cam doesn't have a piece, we have pre-cut stock available for $100, billed as a line-item add to this estimate at the time of selection.`

  const newScopeNotes = (job.scope_notes || '') + curbNote

  // Write back. line_items is JSONB so Supabase accepts the array directly.
  const { error: updErr } = await sb
    .from('jobs')
    .update({
      line_items: lineItems,
      estimated_cost: newEstimatedCost,
      margin_percent: newMarginPercent,
      customer_provides: customerProvides,
      scope_notes: newScopeNotes,
    })
    .eq('id', JOB_ID)
  if (updErr) throw new Error('Update failed: ' + updErr.message)

  console.log('========================================')
  console.log('UPDATED — Cam Howard, job #69')
  console.log('  Trash:           $' + OLD_TRASH + ' → $' + NEW_TRASH + '  (+$' + TRASH_DELTA + ')')
  console.log('  New total:       $' + newEstimatedCost.toFixed(2))
  console.log('  New deposit:     $' + (newEstimatedCost * 0.1).toFixed(2))
  console.log('  New margin:      ' + newMarginPercent + '%')
  console.log('  Customer provides updated: tile + stone curb piece (or $100 from our stock)')
  console.log('  Estimate URL reflects changes immediately.')
  console.log('========================================')
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
