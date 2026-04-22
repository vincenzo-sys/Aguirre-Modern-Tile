import type { JobLineItem } from '@/lib/supabase/types'

export type TemplateName =
  | 'Backsplash (Standard)'
  | 'Backsplash (Large/Complex)'
  | 'Bathroom Floor (Small)'
  | 'Bathroom Floor (Medium)'
  | 'Fireplace Surround'
  | 'Shower Floor Only'
  | 'Standard Tub Surround'
  | 'Tub Surround + Bathroom Floor'
  | 'Walk-in Shower (Small)'
  | 'Walk-in Shower (Large)'

export interface MaterialCatalogRow {
  id: string
  item: string
  category: string
  your_cost: number
  price_to_customer: number
  unit: string
  coverage: number
  retail_link: string | null
}

export interface LaborRateRow {
  setting: string
  value: number
}

export interface OperatingCostRow {
  setting: string
  value: string
}

export interface JobTemplateRow {
  template_name: string
  job_type: string
  typical_sqft_low: number | null
  typical_sqft_high: number | null
  demo_days: number | null
  install_days: number | null
  typical_materials: string | null
}

export interface GenerateOptions {
  sqft?: number | null
  customer_provides?: string[]
  warranty_years?: number
  use_platinum_for_large_format?: boolean
}

export interface GenerateResult {
  line_items: JobLineItem[]
  scope_notes: string
  total: number
  deposit: number
  labor_days: number
  demo_days: number
  install_days: number
  margin_percent: number
}

// Per-template bill of materials. Catalog names match materials_pricing.item
// exactly (verified against prod 2026-04-21). Vince can extend the catalog and
// we'll pick up new items; here we just reference the canonical names.
const TEMPLATE_MATERIALS: Record<TemplateName, Array<{ item: string; qty: number }>> = {
  'Backsplash (Standard)': [
    { item: 'Thinset - 253 Gold (50 lb)', qty: 1 },
    { item: 'Grout 25 lb (bag)', qty: 1 },
    { item: 'Caulking', qty: 1 },
  ],
  'Backsplash (Large/Complex)': [
    { item: 'Thinset - 253 Gold (50 lb)', qty: 1 },
    { item: 'Grout 25 lb (bag)', qty: 1 },
    { item: 'Caulking', qty: 2 },
  ],
  'Bathroom Floor (Small)': [
    { item: 'Cement Board 1/2" (3x5)', qty: 3 },
    { item: 'Thinset - 253 Gold (50 lb)', qty: 1 },
    { item: 'Grout 25 lb (bag)', qty: 1 },
    { item: 'Caulking', qty: 1 },
  ],
  'Bathroom Floor (Medium)': [
    { item: 'Cement Board 1/2" (3x5)', qty: 6 },
    { item: 'Thinset - 253 Gold (50 lb)', qty: 2 },
    { item: 'Grout 25 lb (bag)', qty: 1 },
    { item: 'Caulking', qty: 2 },
  ],
  'Fireplace Surround': [
    { item: 'Cement Board 1/2" (3x5)', qty: 3 },
    { item: 'Thinset - 253 Gold (50 lb)', qty: 1 },
    { item: 'Grout 25 lb (bag)', qty: 1 },
  ],
  'Shower Floor Only': [
    { item: 'Thinset - 253 Gold (50 lb)', qty: 1 },
    { item: 'Grout 25 lb (bag)', qty: 1 },
    { item: 'Caulking', qty: 1 },
  ],
  'Standard Tub Surround': [
    { item: 'GoBoard 1/2" (3x5)', qty: 6 },
    { item: 'Thinset - 253 Gold (50 lb)', qty: 2 },
    { item: 'Grout 25 lb (bag)', qty: 1 },
    { item: 'Caulking', qty: 2 },
  ],
  'Tub Surround + Bathroom Floor': [
    { item: 'GoBoard 1/2" (3x5)', qty: 6 },
    { item: 'Cement Board 1/2" (3x5)', qty: 4 },
    { item: 'Thinset - 253 Gold (50 lb)', qty: 3 },
    { item: 'Grout 25 lb (bag)', qty: 2 },
    { item: 'Caulking', qty: 2 },
  ],
  'Walk-in Shower (Small)': [
    { item: 'GoBoard 1/2" (3x5)', qty: 10 },
    { item: 'Thinset - 253 Gold (50 lb)', qty: 2 },
    { item: 'Grout 25 lb (bag)', qty: 1 },
    { item: 'Caulking', qty: 2 },
  ],
  'Walk-in Shower (Large)': [
    { item: 'GoBoard 1/2" (3x5)', qty: 14 },
    { item: 'Thinset - 253 Gold (50 lb)', qty: 3 },
    { item: 'Grout 25 lb (bag)', qty: 1 },
    { item: 'Caulking', qty: 3 },
  ],
}

const TEMPLATE_DESCRIPTIONS: Record<TemplateName, string> = {
  'Backsplash (Standard)':
    'Kitchen or bathroom backsplash installation on prepared drywall. Tile set, grout, and seal.',
  'Backsplash (Large/Complex)':
    'Kitchen or bathroom backsplash covering a larger area or with intricate layout. Tile set, grout, and seal.',
  'Bathroom Floor (Small)':
    'Bathroom floor retile. Demo existing, install cement-board underlayment, set tile, grout, and seal.',
  'Bathroom Floor (Medium)':
    'Bathroom floor retile (medium size). Demo existing, install cement-board underlayment, set tile, grout, and seal.',
  'Fireplace Surround':
    'Fireplace surround retile. Demo existing, install cement board, set tile, and grout.',
  'Shower Floor Only':
    'Shower floor replacement. Demo existing floor tile, set new tile, grout, and seal.',
  'Standard Tub Surround':
    'Tub surround retile. Demo existing, install GoBoard waterproof backer, set tile on walls, grout, and caulk/seal.',
  'Tub Surround + Bathroom Floor':
    'Bathroom remodel: tub stays, retile tub surround walls (GoBoard) and bathroom floor (cement board underlayment). Set tile, grout, and seal.',
  'Walk-in Shower (Small)':
    'Walk-in shower retile. Demo existing, install GoBoard waterproof backer on walls + floor, set tile, grout, and seal.',
  'Walk-in Shower (Large)':
    'Walk-in shower retile (large footprint). Demo existing, install GoBoard waterproof backer on walls + floor, set tile, grout, and seal.',
}

function matchCatalog(
  materialName: string,
  catalog: MaterialCatalogRow[]
): MaterialCatalogRow | null {
  const norm = materialName.toLowerCase().replace(/\s+/g, ' ').trim()
  // Exact first
  for (const row of catalog) {
    if (row.item.toLowerCase().replace(/\s+/g, ' ').trim() === norm) return row
  }
  // Substring fallback — most-specific (longest) wins
  const candidates = catalog
    .filter((r) => norm.includes(r.item.toLowerCase()) || r.item.toLowerCase().includes(norm))
    .sort((a, b) => b.item.length - a.item.length)
  return candidates[0] ?? null
}

function unitForCatalog(unit: string): JobLineItem['unit'] {
  const map: Record<string, JobLineItem['unit']> = {
    'sq ft/sheet': 'sheet',
    'sq ft/bag': 'bag',
    'sq ft/roll': 'roll',
    'per tube': 'tube',
    'per box': 'box',
    'per piece': 'ea',
    'sq ft': 'sq ft',
  }
  return map[unit] ?? 'ea'
}

function settingValue(rates: LaborRateRow[], name: string): number | null {
  const row = rates.find((r) => r.setting === name)
  return row ? Number(row.value) : null
}

function operatingValue(costs: OperatingCostRow[], name: string): string | null {
  const row = costs.find((c) => c.setting === name)
  return row ? row.value : null
}

function parseDollars(s: string | null): number {
  if (!s) return 0
  const match = s.match(/-?\d[\d,]*(\.\d+)?/)
  return match ? Number(match[0].replace(/,/g, '')) : 0
}

export function generateEstimate(
  template: JobTemplateRow,
  catalog: MaterialCatalogRow[],
  laborRates: LaborRateRow[],
  operatingCosts: OperatingCostRow[],
  opts: GenerateOptions = {}
): GenerateResult {
  const templateKey = template.template_name as TemplateName
  const materials = TEMPLATE_MATERIALS[templateKey] ?? []

  const demoDays = Number(template.demo_days ?? 0)
  const installDays = Number(template.install_days ?? 0)
  const laborDays = demoDays + installDays

  const installRate = settingValue(laborRates, 'Install Labor per Day (to customer)') ?? 950
  const demoRate = settingValue(laborRates, 'Demo Labor per Day (to customer)') ?? 800
  const dayRatePerTiler = settingValue(laborRates, 'Day Rate (per tiler)') ?? 250
  const crewSize = settingValue(laborRates, 'Standard Crew Size') ?? 2

  const trashLargeCost = parseDollars(operatingValue(operatingCosts, 'Trash Disposal - Large Job'))
  const trashSmallCost = parseDollars(operatingValue(operatingCosts, 'Trash Disposal - Small Job'))
  const transportMin = parseDollars(operatingValue(operatingCosts, 'Minimum Transportation Charge'))

  const trashCost = laborDays >= 2 ? trashLargeCost || 300 : trashSmallCost || 150
  const transportCost = transportMin || 25

  const lineItems: JobLineItem[] = []

  if (demoDays > 0) {
    lineItems.push({
      category: 'labor',
      description: 'Demolition — remove existing tile, prep substrate (2-man crew)',
      quantity: demoDays,
      unit: 'day',
      unit_price: demoRate,
      amount: Math.round(demoDays * demoRate * 100) / 100,
    })
  }

  if (installDays > 0) {
    lineItems.push({
      category: 'labor',
      description: 'Installation — waterproofing, precision tile set, hand-finished grout',
      quantity: installDays,
      unit: 'day',
      unit_price: installRate,
      amount: Math.round(installDays * installRate * 100) / 100,
    })
  }

  if (trashCost > 0) {
    lineItems.push({
      category: 'labor',
      description: 'Jobsite cleanup & full debris removal',
      quantity: 1,
      unit: 'ea',
      unit_price: trashCost,
      amount: trashCost,
    })
  }

  if (transportCost > 0) {
    lineItems.push({
      category: 'labor',
      description: 'Delivery & materials transport',
      quantity: 1,
      unit: 'ea',
      unit_price: transportCost,
      amount: transportCost,
    })
  }

  for (const mat of materials) {
    const row = matchCatalog(mat.item, catalog)
    if (!row) continue // silently skip if catalog lacks the item (Vince can add manually)
    const unitPrice = Number(row.price_to_customer)
    const amount = Math.round(unitPrice * mat.qty * 100) / 100
    lineItems.push({
      category: 'materials',
      description: row.item,
      quantity: mat.qty,
      unit: unitForCatalog(row.unit),
      unit_price: unitPrice,
      amount,
      source_url: row.retail_link ?? null,
      source_name: row.retail_link
        ? `${row.item} at ${row.retail_link.split('/')[2]?.replace('www.', '').split('.')[0] ?? 'supplier'}`
        : null,
    })
  }

  // Compute cost side for margin display (not shown to customer)
  const costTotal = lineItems.reduce((sum, item) => {
    if (item.category === 'materials') {
      const row = catalog.find((r) => r.item === item.description)
      if (row) return sum + Number(row.your_cost) * item.quantity
    }
    if (item.category === 'labor' && item.unit === 'day') {
      return sum + dayRatePerTiler * crewSize * item.quantity
    }
    // trash, transport: assume 0 margin (pass-through)
    return sum + item.amount
  }, 0)

  const total = Math.round(lineItems.reduce((s, i) => s + i.amount, 0) * 100) / 100
  const deposit = Math.round(total * 10) / 100
  const marginPercent = total > 0 ? Math.round(((total - costTotal) / total) * 1000) / 10 : 0

  const warrantyYears = opts.warranty_years ?? 3
  const customerProvides = opts.customer_provides && opts.customer_provides.length > 0
    ? opts.customer_provides.join(', ')
    : 'tile'
  const today = new Date().toISOString().slice(0, 10)

  const description = TEMPLATE_DESCRIPTIONS[templateKey] ?? template.template_name
  const sqftLine = opts.sqft
    ? `Area: ${opts.sqft} sq ft`
    : template.typical_sqft_low && template.typical_sqft_high
      ? `Area: ${template.typical_sqft_low}-${template.typical_sqft_high} sq ft (typical for this template)`
      : ''

  const scopeNotes = [
    'SCOPE OF WORK',
    '',
    description,
    ...(sqftLine ? [sqftLine] : []),
    `Template: ${template.template_name}`,
    `Crew days: ${demoDays} demo + ${installDays} install = ${laborDays} total`,
    '',
    'WARRANTY',
    `${warrantyYears}-year warranty on all installation labor. If tile cracks, loosens, or grout fails due to installation defects within ${warrantyYears} years of completion, we repair at no cost.`,
    '',
    "WHAT'S INCLUDED",
    '- Demo, waterproofing, tile installation',
    '- All setting materials (thinset, grout, caulk, sealant)',
    '- Trash haul-off and transportation',
    '',
    "WHAT'S NOT INCLUDED",
    `- Tile (you provide: ${customerProvides})`,
    '- Plumbing fixtures, vanity, toilet, door, electrical',
    '- Paint, drywall repair above tile line, glass enclosure',
    '- Self-leveling compound (if floor requires it — assessed on-site)',
    '',
    'PAYMENT',
    `10% deposit ($${deposit.toFixed(2)}) to reserve install date. Balance due on completion.`,
    '',
    `Valid 30 days. Generated ${today}.`,
  ].join('\n')

  return {
    line_items: lineItems,
    scope_notes: scopeNotes,
    total,
    deposit,
    labor_days: laborDays,
    demo_days: demoDays,
    install_days: installDays,
    margin_percent: marginPercent,
  }
}
