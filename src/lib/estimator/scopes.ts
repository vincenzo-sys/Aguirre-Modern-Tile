// Multi-scope estimator. A "scope" is one template instance applied to a
// specific area (e.g. "Master Bath Walk-in Shower @ 110 sqft"). A job can
// stack N scopes — that's how the user composes "two bathrooms" or
// "shower + floor + backsplash" into a single estimate.
//
// Per scope: walks the template's materials_formula (preferred) or falls back
// to the legacy hardcoded TEMPLATE_MATERIALS (for templates without seeded
// formulas). Each derived line item is tagged with `section: <scope.label>`
// so the customer-facing estimate page (already grouping-aware) renders
// per-scope subtotals.
//
// Trash + transport are project-wide (one trip covers all scopes), not
// per-scope — they're appended once at the end with no section tag.

import type { JobLineItem } from '@/lib/supabase/types'
import type {
  GenerateResult,
  JobTemplateRow,
  MaterialCatalogRow,
  LaborRateRow,
  OperatingCostRow,
} from '@/lib/estimator'
import {
  computeMaterialQty,
  computeLaborDays,
  appliesWhen,
  type MaterialFormulaEntry,
  type LaborFormula,
} from '@/lib/estimator/formulas'

export interface JobScope {
  id: string
  label: string
  template_name: string
  sqft?: number | null
  // Optional per-area sqft for templates that price by region (walk-in
  // showers split walls / shower_floor / outside_floor; tub combos split
  // walls / floor). When provided, takes precedence over sqft and the
  // engine sets sqft = sum of values. When omitted on a sub-aware
  // template, the engine fills it from sqft × default_share.
  sub_sqft?: Record<string, number>
  addons?: Record<string, boolean | number>
  customer_provides?: string[]
}

export interface GenerateScopesOptions {
  warranty_years?: number
}

// One sub-area definition seeded onto the template by migration 023.
// Shape mirrors the JSONB in job_templates.sub_areas.
export interface TemplateSubArea {
  key: string
  label: string
  hint?: string
  default_share?: number
}

// One addon toggle definition seeded onto the template by migration 025.
// Each entry becomes a checkbox in the modal; the chosen values are sent
// back as scope.addons.<key> and gate materials_formula entries via
// applies_when predicates.
export interface TemplateAddon {
  key: string
  label: string
  hint?: string
  default?: boolean
}

export interface ScopedTemplate extends JobTemplateRow {
  materials_formula?: MaterialFormulaEntry[] | null
  labor_formula?: LaborFormula | null
  sub_areas?: TemplateSubArea[] | null
  addons?: TemplateAddon[] | null
}

// Helpers from estimator.ts that we need to reuse. Importing them as private
// utilities would tangle the module graph; these are short enough to inline.
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

function matchCatalog(
  materialName: string,
  catalog: MaterialCatalogRow[]
): MaterialCatalogRow | null {
  const norm = materialName.toLowerCase().replace(/\s+/g, ' ').trim()
  for (const row of catalog) {
    if (row.item.toLowerCase().replace(/\s+/g, ' ').trim() === norm) return row
  }
  const candidates = catalog
    .filter((r) => norm.includes(r.item.toLowerCase()) || r.item.toLowerCase().includes(norm))
    .sort((a, b) => b.item.length - a.item.length)
  return candidates[0] ?? null
}

// When a scope's sqft is not provided, fall back to the template's typical
// midpoint so formulas have something reasonable to compute against. Without
// this, sqft=0 + min floors would always produce the smallest possible bill,
// underquoting jobs the user hasn't measured yet.
function effectiveSqft(scope: JobScope, template: ScopedTemplate): number {
  if (scope.sqft && scope.sqft > 0) return scope.sqft
  const lo = template.typical_sqft_low ?? null
  const hi = template.typical_sqft_high ?? null
  if (lo && hi) return Math.round((lo + hi) / 2)
  return lo ?? hi ?? 0
}

// Build the sub_sqft map that's passed into formula evaluation. Three
// sources, in priority order:
//
//   1. scope.sub_sqft — explicit per-area input from the modal. If provided,
//      use it verbatim and derive total sqft from the sum.
//   2. template.sub_areas + scope.sqft + default_share — legacy callers
//      submit one sqft to a sub-aware template; we split it across the
//      template's declared sub-areas using each entry's default_share so
//      MCP / tile-estimate skill / old API requests keep producing
//      reasonable numbers without code changes on their side.
//   3. Neither — return {} and let formulas fall back to plain `sqft`.
//
// The returned object always has a key for every entry in template.sub_areas
// (even if 0), so a formula like `ceil(sub_sqft.outside_floor / 15)` never
// hits an undefined → NaN.
function buildSubSqft(
  scope: JobScope,
  template: ScopedTemplate,
  effective_sqft: number
): { sub_sqft: Record<string, number>; total_from_sub: number | null } {
  const sub_areas = Array.isArray(template.sub_areas) ? template.sub_areas : []
  if (sub_areas.length === 0) {
    return { sub_sqft: {}, total_from_sub: null }
  }
  const out: Record<string, number> = {}
  // Initialize every declared sub-area to 0 so missing keys never throw.
  for (const a of sub_areas) out[a.key] = 0

  if (scope.sub_sqft && Object.keys(scope.sub_sqft).length > 0) {
    let total = 0
    for (const [k, v] of Object.entries(scope.sub_sqft)) {
      const n = Number(v) || 0
      out[k] = n
      total += n
    }
    return { sub_sqft: out, total_from_sub: total }
  }

  // Fallback: split effective_sqft across sub_areas using default_share.
  for (const a of sub_areas) {
    if (a.default_share && a.default_share > 0) {
      out[a.key] = effective_sqft * a.default_share
    }
  }
  return { sub_sqft: out, total_from_sub: null }
}

interface ScopeBuildResult {
  line_items: JobLineItem[]
  demo_days: number
  install_days: number
  scope_total: number
  description_line: string
}

function buildScope(
  scope: JobScope,
  template: ScopedTemplate,
  catalog: MaterialCatalogRow[],
  laborRates: LaborRateRow[]
): ScopeBuildResult {
  const sqft_input = effectiveSqft(scope, template)
  const { sub_sqft, total_from_sub } = buildSubSqft(scope, template, sqft_input)
  // When the modal supplied per-area numbers, the authoritative total is
  // their sum (sqft_input might be 0 because the user only filled sub-areas).
  // Otherwise fall back to the user's single sqft input.
  const sqft = total_from_sub ?? sqft_input
  const formulaVars = {
    sqft,
    sub_sqft,
    addons: scope.addons ?? {},
  }

  // ── Labor ────────────────────────────────────────────────────────────
  const laborFormula = template.labor_formula ?? {}
  const demoDays = laborFormula.demo_days
    ? computeLaborDays({ formula: laborFormula.demo_days, vars: formulaVars, min: laborFormula.min_demo })
    : Number(template.demo_days ?? 0)
  const installDays = laborFormula.install_days
    ? computeLaborDays({ formula: laborFormula.install_days, vars: formulaVars, min: laborFormula.min_install })
    : Number(template.install_days ?? 0)

  const installRate = settingValue(laborRates, 'Install Labor per Day (to customer)') ?? 950
  const demoRate = settingValue(laborRates, 'Demo Labor per Day (to customer)') ?? 800

  const lineItems: JobLineItem[] = []
  if (demoDays > 0) {
    lineItems.push({
      category: 'labor',
      description: 'Demolition — remove existing tile, prep substrate (2-man crew)',
      quantity: demoDays,
      unit: 'day',
      unit_price: demoRate,
      amount: Math.round(demoDays * demoRate * 100) / 100,
      section: scope.label,
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
      section: scope.label,
    })
  }

  // ── Materials ────────────────────────────────────────────────────────
  const formulas = Array.isArray(template.materials_formula) ? template.materials_formula : []
  if (formulas.length === 0) {
    // Template hasn't been migrated to formulas yet — caller should have
    // already considered the legacy hardcoded path. We fail loud here so a
    // misconfigured template doesn't silently produce a labor-only estimate.
    throw new Error(
      `Template "${template.template_name}" has no materials_formula. ` +
        'Run migration 022 or seed formulas before generating.'
    )
  }

  for (const entry of formulas) {
    if (!appliesWhen(entry.applies_when, scope.addons ?? {})) continue
    const qty = computeMaterialQty({
      formula: entry.formula,
      vars: formulaVars,
      min: entry.min,
      max: entry.max,
    })
    if (qty <= 0) continue
    const row = matchCatalog(entry.item, catalog)
    if (!row) continue // catalog gap — owner can add the line manually after
    const unitPrice = Number(row.price_to_customer)
    const amount = Math.round(unitPrice * qty * 100) / 100
    lineItems.push({
      category: 'materials',
      description: row.item,
      quantity: qty,
      unit: unitForCatalog(row.unit),
      unit_price: unitPrice,
      amount,
      status: 'needed',
      source_url: row.retail_link ?? null,
      source_name: row.retail_link
        ? `${row.item} at ${row.retail_link.split('/')[2]?.replace('www.', '').split('.')[0] ?? 'supplier'}`
        : null,
      section: scope.label,
    })
  }

  const scopeTotal = lineItems.reduce((s, i) => s + i.amount, 0)
  // Description: show sub-area breakdown when present (so the scope notes
  // record exactly what was measured), otherwise the single sqft input.
  let sqftLine: string
  if (total_from_sub !== null) {
    const parts = Object.entries(sub_sqft)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${Math.round(v)} ${k.replace(/_/g, ' ')}`)
    sqftLine = `${Math.round(sqft)} sq ft total — ${parts.join(' + ')}`
  } else {
    sqftLine = scope.sqft ? `${scope.sqft} sq ft` : `${sqft} sq ft typical`
  }
  const description_line = `${scope.label} — ${template.template_name} (${sqftLine})`

  return {
    line_items: lineItems,
    demo_days: demoDays,
    install_days: installDays,
    scope_total: scopeTotal,
    description_line,
  }
}

export function generateFromScopes(
  scopes: JobScope[],
  templates: ScopedTemplate[],
  catalog: MaterialCatalogRow[],
  laborRates: LaborRateRow[],
  operatingCosts: OperatingCostRow[],
  opts: GenerateScopesOptions = {}
): GenerateResult {
  if (scopes.length === 0) {
    throw new Error('At least one scope is required to generate an estimate')
  }

  const dayRatePerTiler = settingValue(laborRates, 'Day Rate (per tiler)') ?? 250
  const crewSize = settingValue(laborRates, 'Standard Crew Size') ?? 2

  const trashLargeCost = parseDollars(operatingValue(operatingCosts, 'Trash Disposal - Large Job'))
  const trashSmallCost = parseDollars(operatingValue(operatingCosts, 'Trash Disposal - Small Job'))
  const transportMin = parseDollars(operatingValue(operatingCosts, 'Minimum Transportation Charge'))

  // Build each scope and accumulate.
  const allLineItems: JobLineItem[] = []
  const descriptions: string[] = []
  let totalDemo = 0
  let totalInstall = 0

  for (const scope of scopes) {
    const template = templates.find((t) => t.template_name === scope.template_name)
    if (!template) {
      throw new Error(`Template "${scope.template_name}" not found for scope "${scope.label}"`)
    }
    const built = buildScope(scope, template, catalog, laborRates)
    allLineItems.push(...built.line_items)
    descriptions.push(built.description_line)
    totalDemo += built.demo_days
    totalInstall += built.install_days
  }

  // ── Project-wide line items (trash + transport, one set total) ───────
  const totalLaborDays = totalDemo + totalInstall
  const trashCost = totalLaborDays >= 2 ? trashLargeCost || 300 : trashSmallCost || 150
  const transportCost = transportMin || 25

  if (trashCost > 0) {
    allLineItems.push({
      category: 'labor',
      description: 'Jobsite cleanup & full debris removal',
      quantity: 1,
      unit: 'ea',
      unit_price: trashCost,
      amount: trashCost,
      section: null,
    })
  }
  if (transportCost > 0) {
    allLineItems.push({
      category: 'labor',
      description: 'Delivery & materials transport',
      quantity: 1,
      unit: 'ea',
      unit_price: transportCost,
      amount: transportCost,
      section: null,
    })
  }

  // ── Totals + margin ──────────────────────────────────────────────────
  const total = Math.round(allLineItems.reduce((s, i) => s + i.amount, 0) * 100) / 100
  const deposit = Math.round(total * 10) / 100

  const costTotal = allLineItems.reduce((sum, item) => {
    if (item.category === 'materials') {
      const row = catalog.find((r) => r.item === item.description)
      if (row) return sum + Number(row.your_cost) * item.quantity
    }
    if (item.category === 'labor' && item.unit === 'day') {
      return sum + dayRatePerTiler * crewSize * item.quantity
    }
    return sum + item.amount
  }, 0)
  const marginPercent = total > 0 ? Math.round(((total - costTotal) / total) * 1000) / 10 : 0

  // ── Scope notes ──────────────────────────────────────────────────────
  const warrantyYears = opts.warranty_years ?? 3
  const allCustomerProvides = new Set<string>()
  for (const s of scopes) {
    for (const cp of s.customer_provides ?? []) allCustomerProvides.add(cp)
  }
  if (allCustomerProvides.size === 0) allCustomerProvides.add('tile')
  const today = new Date().toISOString().slice(0, 10)

  const scopeNotes = [
    'SCOPE OF WORK',
    '',
    ...descriptions,
    '',
    `Crew days: ${totalDemo} demo + ${totalInstall} install = ${totalLaborDays} total`,
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
    `- Tile (you provide: ${Array.from(allCustomerProvides).join(', ')})`,
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
    line_items: allLineItems,
    scope_notes: scopeNotes,
    total,
    deposit,
    labor_days: totalLaborDays,
    demo_days: totalDemo,
    install_days: totalInstall,
    margin_percent: marginPercent,
  }
}
