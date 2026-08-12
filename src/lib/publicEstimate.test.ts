import { describe, it, expect } from 'vitest'
import { publicLineItems, toPublicOption, depositFor } from './publicEstimate'

// These assert what must NOT reach the customer. The estimate link has no auth,
// so a regression here is a real disclosure — Aguirre's margin and its supplier
// pricing — not a cosmetic bug.

describe('publicLineItems', () => {
  it('strips supplier links and cost breadcrumbs', () => {
    const [out] = publicLineItems([
      {
        category: 'materials',
        description: 'Porcelain 12x24',
        quantity: 3,
        unit: 'box',
        unit_price: 60,
        amount: 180,
        source_url: 'https://www.flooranddecor.com/some-sku',
        source_name: 'Floor & Decor',
        status: 'ordered',
      },
    ])

    expect(out).toEqual({
      category: 'materials',
      description: 'Porcelain 12x24',
      quantity: 3,
      unit: 'box',
      unit_price: 60,
      amount: 180,
      section: null,
    })
    expect(out).not.toHaveProperty('source_url')
    expect(out).not.toHaveProperty('source_name')
    expect(out).not.toHaveProperty('status')
  })

  it('allow-lists rather than deletes, so a future column is private by default', () => {
    const [out] = publicLineItems([
      { category: 'labor', description: 'Install', quantity: 1, unit: 'day', unit_price: 1000, amount: 1000, your_cost: 420, internal_note: 'padded' },
    ])

    expect(out).not.toHaveProperty('your_cost')
    expect(out).not.toHaveProperty('internal_note')
    expect(Object.keys(out).sort()).toEqual([
      'amount',
      'category',
      'description',
      'quantity',
      'section',
      'unit',
      'unit_price',
    ])
  })

  it('preserves the section label used for grouping', () => {
    const [out] = publicLineItems([
      { category: 'materials', description: 'Grout', quantity: 1, unit: 'bag', unit_price: 30, amount: 30, section: 'Master Bath' },
    ])
    expect(out.section).toBe('Master Bath')
  })

  it('returns an empty list for null or non-array input', () => {
    expect(publicLineItems(null)).toEqual([])
    expect(publicLineItems(undefined)).toEqual([])
    expect(publicLineItems({})).toEqual([])
  })
})

describe('toPublicOption', () => {
  const row = {
    option_key: 'b',
    label: 'Upgraded',
    blurb: 'Larger format tile',
    sort_order: 1,
    is_primary: false,
    selected_at: '2026-08-12T10:00:00Z',
    line_items: [
      { category: 'materials', description: 'Tile', quantity: 1, unit: 'ea', unit_price: 900, amount: 900, source_url: 'https://supplier.example' },
    ],
    scope_notes: 'Scope text',
    estimated_cost: '10150.00',
    estimated_days: 5,
    customer_provides: null,
    warranty_text: '3 year',
    payment_terms_text: 'Terms',
    payment_methods: ['Zelle'],
    // Fields a careless select might drag along:
    margin_percent: 43.2,
    created_by: 'some-uuid',
  }

  it('never exposes margin_percent', () => {
    const out = toPublicOption(row)
    expect(out).not.toHaveProperty('margin_percent')
    expect(JSON.stringify(out)).not.toContain('43.2')
  })

  it('never exposes internal provenance', () => {
    const out = toPublicOption(row)
    expect(out).not.toHaveProperty('created_by')
    expect(JSON.stringify(out)).not.toContain('supplier.example')
  })

  it('reduces selected_at to a boolean rather than leaking the timestamp', () => {
    expect(toPublicOption(row).selected).toBe(true)
    expect(toPublicOption({ ...row, selected_at: null }).selected).toBe(false)
    expect(toPublicOption(row)).not.toHaveProperty('selected_at')
  })

  it('coerces the Postgres numeric string and derives the 10% deposit', () => {
    const out = toPublicOption(row)
    expect(out.estimated_cost).toBe(10150)
    expect(out.deposit_amount).toBe(1015)
  })

  it('handles an unpriced option without producing a bogus deposit', () => {
    const out = toPublicOption({ ...row, estimated_cost: null })
    expect(out.estimated_cost).toBeNull()
    expect(out.deposit_amount).toBe(0)
  })
})

describe('depositFor', () => {
  it('is 10%, rounded to cents, and never negative', () => {
    expect(depositFor(8420)).toBe(842)
    expect(depositFor('10150.55')).toBe(1015.06)
    expect(depositFor(null)).toBe(0)
    expect(depositFor(-500)).toBe(0)
  })
})
