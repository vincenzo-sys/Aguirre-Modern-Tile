import { describe, it, expect } from 'vitest'
import {
  diffEstimates,
  groupDiffBySection,
  lineItemKey,
  sectionOf,
  type EstimateSnapshot,
} from './diffEstimates'
import type { JobLineItem } from '@/lib/supabase/types'

const li = (over: Partial<JobLineItem> = {}): JobLineItem => ({
  category: 'materials',
  description: 'Porcelain 12x24',
  quantity: 1,
  unit: 'ea',
  unit_price: 100,
  amount: 100,
  section: null,
  ...over,
})

const snap = (items: JobLineItem[], over: Partial<EstimateSnapshot> = {}): EstimateSnapshot => ({
  line_items: items,
  estimated_cost: items.reduce((s, i) => s + i.amount, 0),
  estimated_days: null,
  ...over,
})

describe('diffEstimates', () => {
  it('reports no changes between identical estimates', () => {
    const items = [li(), li({ description: 'Thinset', amount: 40, unit_price: 40 })]
    const d = diffEstimates(snap(items), snap(items))

    expect(d.isEmpty).toBe(true)
    expect(d.added).toHaveLength(0)
    expect(d.removed).toHaveLength(0)
    expect(d.changed).toHaveLength(0)
    expect(d.unchangedCount).toBe(2)
    expect(d.totalDelta).toBe(0)
  })

  it('detects an added line', () => {
    const before = [li()]
    const after = [li(), li({ description: 'Shower niche', amount: 340, unit_price: 340 })]
    const d = diffEstimates(snap(before), snap(after))

    expect(d.added.map((i) => i.description)).toEqual(['Shower niche'])
    expect(d.removed).toHaveLength(0)
    expect(d.totalDelta).toBe(340)
    expect(d.isEmpty).toBe(false)
  })

  it('detects a removed line', () => {
    const before = [li(), li({ description: 'Heated floor', amount: 1200, unit_price: 1200 })]
    const after = [li()]
    const d = diffEstimates(snap(before), snap(after))

    expect(d.removed.map((i) => i.description)).toEqual(['Heated floor'])
    expect(d.added).toHaveLength(0)
    expect(d.totalDelta).toBe(-1200)
  })

  it('detects a price change and reports signed deltas', () => {
    const before = [li({ amount: 100, unit_price: 100, quantity: 1 })]
    const after = [li({ amount: 280, unit_price: 140, quantity: 2 })]
    const d = diffEstimates(snap(before), snap(after))

    expect(d.changed).toHaveLength(1)
    expect(d.changed[0].amountDelta).toBe(180)
    expect(d.changed[0].quantityDelta).toBe(1)
    expect(d.changed[0].unitPriceDelta).toBe(40)
    expect(d.added).toHaveLength(0)
    expect(d.removed).toHaveLength(0)
  })

  it('treats a unit swap as a change, not an add plus a remove', () => {
    const before = [li({ description: 'Grout', unit: 'bag', amount: 60 })]
    const after = [li({ description: 'Grout', unit: 'box', amount: 60 })]
    const d = diffEstimates(snap(before), snap(after))

    expect(d.changed).toHaveLength(1)
    expect(d.added).toHaveLength(0)
    expect(d.removed).toHaveLength(0)
  })

  it('ignores purchasing status — the crew marking a material ordered is not a revision', () => {
    const before = [li({ status: 'needed' })]
    const after = [li({ status: 'on_site' })]
    const d = diffEstimates(snap(before), snap(after))

    expect(d.isEmpty).toBe(true)
    expect(d.changed).toHaveLength(0)
  })

  it('ignores internal price-shopping links the customer never sees', () => {
    const before = [li({ source_url: null, source_name: null })]
    const after = [li({ source_url: 'https://floordecor.com/x', source_name: 'Floor & Decor' })]

    expect(diffEstimates(snap(before), snap(after)).isEmpty).toBe(true)
  })

  it('pairs duplicate section+description lines positionally instead of collapsing them', () => {
    // Two genuinely distinct rows that share a name. A plain Map would drop one
    // and report a phantom add/remove.
    const before = [
      li({ description: 'Thinset', amount: 40 }),
      li({ description: 'Thinset', amount: 40 }),
    ]
    const after = [
      li({ description: 'Thinset', amount: 40 }),
      li({ description: 'Thinset', amount: 55 }),
    ]
    const d = diffEstimates(snap(before), snap(after))

    expect(d.added).toHaveLength(0)
    expect(d.removed).toHaveLength(0)
    expect(d.changed).toHaveLength(1)
    expect(d.changed[0].amountDelta).toBe(15)
    expect(d.unchangedCount).toBe(1)
  })

  it('reports a dropped duplicate as one removal, keeping the survivor unchanged', () => {
    const before = [li({ description: 'Thinset' }), li({ description: 'Thinset' })]
    const after = [li({ description: 'Thinset' })]
    const d = diffEstimates(snap(before), snap(after))

    expect(d.removed).toHaveLength(1)
    expect(d.unchangedCount).toBe(1)
    expect(d.added).toHaveLength(0)
  })

  it('scopes identity to the section, so same-named lines in two rooms stay distinct', () => {
    const before = [
      li({ description: 'Thinset', section: 'Master Bath', amount: 40 }),
      li({ description: 'Thinset', section: 'Kitchen', amount: 40 }),
    ]
    const after = [
      li({ description: 'Thinset', section: 'Master Bath', amount: 40 }),
      li({ description: 'Thinset', section: 'Kitchen', amount: 90 }),
    ]
    const d = diffEstimates(snap(before), snap(after))

    expect(d.changed).toHaveLength(1)
    expect(sectionOf(d.changed[0].after)).toBe('Kitchen')
    expect(d.unchangedCount).toBe(1)
  })

  it('uses the stored total when it disagrees with the line sum (hand-built flat quotes)', () => {
    const items = [li({ amount: 100 })]
    const d = diffEstimates(
      { line_items: items, estimated_cost: 8000 },
      { line_items: items, estimated_cost: 8420 }
    )

    expect(d.totalBefore).toBe(8000)
    expect(d.totalAfter).toBe(8420)
    expect(d.totalDelta).toBe(420)
    expect(d.isEmpty).toBe(false) // total moved even though no line did
  })

  it('falls back to the line sum when no total is stored', () => {
    const d = diffEstimates(
      { line_items: [li({ amount: 100 })], estimated_cost: null },
      { line_items: [li({ amount: 100 }), li({ description: 'Trim', amount: 25 })] }
    )

    expect(d.totalBefore).toBe(100)
    expect(d.totalAfter).toBe(125)
  })

  it('accepts numeric-string totals as Postgres numeric returns them', () => {
    const d = diffEstimates(
      { line_items: [], estimated_cost: '8000.00' },
      { line_items: [], estimated_cost: '8420.50' }
    )

    expect(d.totalDelta).toBe(420.5)
  })

  it('tracks install days alongside price', () => {
    const d = diffEstimates(
      snap([li()], { estimated_days: 4 }),
      snap([li()], { estimated_days: 6 })
    )

    expect(d.daysBefore).toBe(4)
    expect(d.daysAfter).toBe(6)
    expect(d.daysDelta).toBe(2)
    expect(d.isEmpty).toBe(false)
  })

  it('handles an empty or missing before-side (the very first estimate)', () => {
    const d = diffEstimates({ line_items: null }, snap([li(), li({ description: 'Grout' })]))

    expect(d.added).toHaveLength(2)
    expect(d.removed).toHaveLength(0)
    expect(d.totalBefore).toBe(0)
  })

  it('rounds money to cents rather than leaking float noise', () => {
    const d = diffEstimates(
      { line_items: [], estimated_cost: 0.1 },
      { line_items: [], estimated_cost: 0.3 }
    )

    expect(d.totalDelta).toBe(0.2) // not 0.19999999999999998
  })
})

describe('groupDiffBySection', () => {
  it('groups entries by section and floats project-wide lines last', () => {
    const before = [
      li({ description: 'Tile', section: 'Master Bath', amount: 500 }),
      li({ description: 'Dump fee', section: null, amount: 300 }),
    ]
    const after = [
      li({ description: 'Tile', section: 'Master Bath', amount: 650 }),
      li({ description: 'Niche', section: 'Master Bath', amount: 340 }),
      li({ description: 'Dump fee', section: null, amount: 300 }),
      li({ description: 'Transport', section: null, amount: 88 }),
    ]

    const groups = groupDiffBySection(diffEstimates(snap(before), snap(after)))

    expect(groups.map((g) => g.section)).toEqual(['Master Bath', ''])
    expect(groups[0].changed).toHaveLength(1)
    expect(groups[0].added.map((i) => i.description)).toEqual(['Niche'])
    expect(groups[1].added.map((i) => i.description)).toEqual(['Transport'])
  })

  it('returns nothing to render for an unchanged estimate', () => {
    const items = [li()]
    expect(groupDiffBySection(diffEstimates(snap(items), snap(items)))).toHaveLength(0)
  })
})

describe('lineItemKey', () => {
  it('separates sections and numbers repeats', () => {
    expect(lineItemKey(li({ description: 'Grout', section: 'Kitchen' }))).toBe('Kitchen::Grout#0')
    expect(lineItemKey(li({ description: 'Grout', section: null }), 2)).toBe('::Grout#2')
  })
})
