import { describe, it, expect } from 'vitest'
import { generateFromScopes, type JobScope, type ScopedTemplate } from './scopes'
import type { MaterialCatalogRow, LaborRateRow, OperatingCostRow } from '@/lib/estimator'
import type { JobLineItem } from '@/lib/supabase/types'

// ── Money-path tests for generateFromScopes ─────────────────────────────
//
// The pure formula DSL is covered by formulas.test.ts. This file exercises
// the engine that turns a measured scope into dollars: catalog matching,
// labor-line pricing, project-wide trash + transport, margin math, the
// sub-area sqft split, and the warnings channel (unpriceable material,
// off-band margin). Deterministic fixtures — every expected number is
// hand-computed in the assertions.

const laborRates: LaborRateRow[] = [
  { setting: 'Install Labor per Day (to customer)', value: 950 },
  { setting: 'Demo Labor per Day (to customer)', value: 800 },
  { setting: 'Day Rate (per tiler)', value: 250 },
  { setting: 'Standard Crew Size', value: 2 },
]

const operatingCosts: OperatingCostRow[] = [
  { setting: 'Trash Disposal - Large Job', value: '$300' },
  { setting: 'Transportation Rate per Mile', value: '$0.70' },
  { setting: 'Minimum Transportation Charge', value: '$25' },
]

function catalogRow(over: Partial<MaterialCatalogRow> & { item: string }): MaterialCatalogRow {
  return {
    id: over.item,
    category: 'Materials',
    your_cost: 0,
    price_to_customer: 0,
    unit: 'per piece',
    coverage: 1,
    retail_link: null,
    ...over,
  }
}

const catalog: MaterialCatalogRow[] = [
  catalogRow({ item: 'Test Thinset', your_cost: 30, price_to_customer: 40, unit: 'sq ft/bag', coverage: 50 }),
  catalogRow({ item: 'Test Grout', your_cost: 20, price_to_customer: 30, unit: 'sq ft/bag', coverage: 100 }),
]

function template(over: Partial<ScopedTemplate> & { template_name: string }): ScopedTemplate {
  return {
    job_type: 'Floor',
    typical_sqft_low: 40,
    typical_sqft_high: 60,
    demo_days: 1,
    install_days: 2,
    typical_materials: null,
    materials_formula: null,
    labor_formula: null,
    sub_areas: null,
    addons: null,
    ...over,
  }
}

function itemsByDesc(items: JobLineItem[], desc: string) {
  return items.find((i) => i.description === desc)
}

describe('generateFromScopes — full money path', () => {
  const floor = template({
    template_name: 'Test Floor',
    materials_formula: [
      { item: 'Test Thinset', formula: 'ceil(sqft / 50)', min: 1 },
      { item: 'Test Grout', formula: 'ceil(sqft / 100)', min: 1 },
      { item: 'Missing Material', formula: '1', min: 1 }, // no catalog row → dropped + warned
    ],
  })
  const scope: JobScope = { id: 's1', label: 'Kitchen', template_name: 'Test Floor', sqft: 100 }
  const result = generateFromScopes([scope], [floor], catalog, laborRates, operatingCosts)

  it('prices labor days at the to-customer rate', () => {
    expect(itemsByDesc(result.line_items, 'Demolition — remove existing tile, prep substrate (2-man crew)')?.amount).toBe(800)
    expect(itemsByDesc(result.line_items, 'Installation — waterproofing, precision tile set, hand-finished grout')?.amount).toBe(1900)
    expect(result.demo_days).toBe(1)
    expect(result.install_days).toBe(2)
    expect(result.labor_days).toBe(3)
  })

  it('derives material quantities from formulas and prices them from the catalog', () => {
    const thinset = itemsByDesc(result.line_items, 'Test Thinset')
    expect(thinset).toMatchObject({ quantity: 2, unit_price: 40, amount: 80, unit: 'bag' })
    const grout = itemsByDesc(result.line_items, 'Test Grout')
    expect(grout).toMatchObject({ quantity: 1, amount: 30 })
  })

  it('drops an unmatched material from the bill and reports it as a warning', () => {
    expect(itemsByDesc(result.line_items, 'Missing Material')).toBeUndefined()
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('Missing Material')
    expect(result.warnings[0]).toContain('Kitchen')
  })

  it('appends one project-wide trash + transport pair', () => {
    expect(itemsByDesc(result.line_items, 'Jobsite cleanup & full debris removal')?.amount).toBe(300)
    // No miles passed → transport falls back to the $25 minimum.
    const transport = result.line_items.find((i) => i.amount === 25 && i.section == null)
    expect(transport).toBeDefined()
  })

  it('sums the total, deposit, and margin correctly', () => {
    // 800 + 1900 + 80 + 30 + 300 + 25 = 3135
    expect(result.total).toBe(3135)
    expect(result.deposit).toBe(313.5)
    // cost: materials 30*2 + 20*1 = 80; labor 250*2*3 = 1500; trash+transport 325 → 1905
    // margin = (3135 - 1905) / 3135 = 39.2%
    expect(result.margin_percent).toBe(39.2)
  })
})

describe('generateFromScopes — margin sanity guard', () => {
  it('warns when margin falls below the 20% floor', () => {
    const cheap = template({
      template_name: 'Cheap',
      demo_days: 0,
      install_days: 0,
      materials_formula: [{ item: 'Test Thinset', formula: '1', min: 1 }],
    })
    // total 40 + 300 trash + 25 transport = 365; cost 30 + 325 = 355 → 2.7%
    const result = generateFromScopes(
      [{ id: 's1', label: 'Tiny', template_name: 'Cheap', sqft: 10 }],
      [cheap], catalog, laborRates, operatingCosts
    )
    expect(result.margin_percent).toBe(2.7)
    expect(result.warnings.some((w) => w.includes('Margin') && w.includes('below'))).toBe(true)
  })

  it('warns when margin is unusually high (labor/materials likely missing)', () => {
    const rich = [catalogRow({ item: 'Gold Bar', your_cost: 1, price_to_customer: 1000 })]
    const richTemplate = template({
      template_name: 'Rich',
      demo_days: 0,
      install_days: 0,
      materials_formula: [{ item: 'Gold Bar', formula: '1', min: 1 }],
    })
    // total 1000 + 325 = 1325; cost 1 + 325 = 326 → 75.4%
    const result = generateFromScopes(
      [{ id: 's1', label: 'One', template_name: 'Rich', sqft: 10 }],
      [richTemplate], rich, laborRates, operatingCosts
    )
    expect(result.margin_percent).toBe(75.4)
    expect(result.warnings.some((w) => w.includes('unusually high'))).toBe(true)
  })

  it('emits no warnings on a clean, in-band estimate', () => {
    const clean = template({
      template_name: 'Clean',
      materials_formula: [
        { item: 'Test Thinset', formula: 'ceil(sqft / 50)', min: 1 },
        { item: 'Test Grout', formula: 'ceil(sqft / 100)', min: 1 },
      ],
    })
    const result = generateFromScopes(
      [{ id: 's1', label: 'Kitchen', template_name: 'Clean', sqft: 100 }],
      [clean], catalog, laborRates, operatingCosts
    )
    expect(result.warnings).toHaveLength(0)
  })
})

describe('generateFromScopes — sub-area sqft split', () => {
  const board = [catalogRow({ item: 'Test Board', your_cost: 5, price_to_customer: 10, unit: 'sq ft/sheet', coverage: 15 })]
  const wall = template({
    template_name: 'Wall',
    job_type: 'Shower',
    demo_days: 0,
    install_days: 0,
    materials_formula: [{ item: 'Test Board', formula: 'ceil(sub_sqft.walls / 12)', min: 1 }],
    sub_areas: [
      { key: 'walls', label: 'Walls', default_share: 0.7 },
      { key: 'floor', label: 'Floor', default_share: 0.3 },
    ],
  })

  it('splits a single sqft across sub-areas by default_share', () => {
    // sqft 100 → walls 70 → ceil(70/12) = 6
    const result = generateFromScopes(
      [{ id: 's1', label: 'Shower', template_name: 'Wall', sqft: 100 }],
      [wall], board, laborRates, operatingCosts
    )
    expect(itemsByDesc(result.line_items, 'Test Board')?.quantity).toBe(6)
  })

  it('uses explicit sub_sqft verbatim when provided', () => {
    // walls 24 → ceil(24/12) = 2
    const result = generateFromScopes(
      [{ id: 's1', label: 'Shower', template_name: 'Wall', sqft: 0, sub_sqft: { walls: 24, floor: 10 } }],
      [wall], board, laborRates, operatingCosts
    )
    expect(itemsByDesc(result.line_items, 'Test Board')?.quantity).toBe(2)
  })
})

describe('generateFromScopes — labor_formula scaling', () => {
  it('scales labor with sqft and overrides the static day constants', () => {
    const scaled = template({
      template_name: 'LaborScale',
      demo_days: 1, // static fallback — should be ignored when a formula is present
      install_days: 2,
      labor_formula: { install_days: 'sqft / 50', min_install: 1, demo_days: 'sqft / 200', min_demo: 1 },
      materials_formula: [{ item: 'Test Thinset', formula: '1', min: 1 }],
    })
    // sqft 300 → install 300/50 = 6, demo 300/200 = 1.5 (rounds to nearest half day)
    const result = generateFromScopes(
      [{ id: 's1', label: 'Big', template_name: 'LaborScale', sqft: 300 }],
      [scaled], catalog, laborRates, operatingCosts
    )
    expect(result.install_days).toBe(6)
    expect(result.demo_days).toBe(1.5)
  })

  it('caps labor at max_install so a fat-fingered sqft cannot run away', () => {
    const capped = template({
      template_name: 'Capped',
      demo_days: 0,
      install_days: 2,
      labor_formula: { install_days: 'sqft / 50', min_install: 1, max_install: 6 },
      materials_formula: [{ item: 'Test Thinset', formula: '1', min: 1 }],
    })
    // sqft 5000 → 100 days uncapped, clamped to 6
    const result = generateFromScopes(
      [{ id: 's1', label: 'Oops', template_name: 'Capped', sqft: 5000 }],
      [capped], catalog, laborRates, operatingCosts
    )
    expect(result.install_days).toBe(6)
  })
})
