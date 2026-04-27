import type { JobLineItem } from '@/lib/supabase/types'
import { generateFromScopes, type ScopedTemplate, type JobScope } from '@/lib/estimator/scopes'
import type { MaterialFormulaEntry } from '@/lib/estimator/formulas'

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

// Mirrors the job_templates row shape including the formula columns added in
// migration 021 and sub_areas added in migration 023. Both formula fields
// are optional — legacy templates may arrive without them and we synthesize
// formulas from TEMPLATE_MATERIALS below as a safety net.
export interface JobTemplateRow {
  template_name: string
  job_type: string
  typical_sqft_low: number | null
  typical_sqft_high: number | null
  demo_days: number | null
  install_days: number | null
  typical_materials: string | null
  materials_formula?: MaterialFormulaEntry[] | null
  labor_formula?: import('@/lib/estimator/formulas').LaborFormula | null
  sub_areas?: import('@/lib/estimator/scopes').TemplateSubArea[] | null
  addons?: import('@/lib/estimator/scopes').TemplateAddon[] | null
}

export interface GenerateOptions {
  sqft?: number | null
  sub_sqft?: Record<string, number>
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

// Legacy hardcoded bill of materials. After migration 022 every seeded template
// has a materials_formula in the DB so this constant is rarely consulted, but
// we keep it as a safety net: if a template arrives without formulas (older
// jobs, custom templates added post-migration), we synthesize a constant-qty
// formula list from this map so generation still succeeds.
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
    { item: 'GoBoard Sealant', qty: 2 },
    { item: 'GoBoard Caps & Screws', qty: 1 },
    { item: 'Thinset - 253 Gold (50 lb)', qty: 2 },
    { item: 'Grout 25 lb (bag)', qty: 1 },
    { item: 'Caulking', qty: 2 },
  ],
  'Tub Surround + Bathroom Floor': [
    { item: 'GoBoard 1/2" (3x5)', qty: 6 },
    { item: 'GoBoard Sealant', qty: 3 },
    { item: 'GoBoard Caps & Screws', qty: 1 },
    { item: 'Cement Board 1/2" (3x5)', qty: 4 },
    { item: 'Thinset - 253 Gold (50 lb)', qty: 3 },
    { item: 'Grout 25 lb (bag)', qty: 2 },
    { item: 'Caulking', qty: 2 },
  ],
  'Walk-in Shower (Small)': [
    { item: 'GoBoard 1/2" (3x5)', qty: 10 },
    { item: 'GoBoard Sealant', qty: 3 },
    { item: 'GoBoard Caps & Screws', qty: 2 },
    { item: 'Thinset - 253 Gold (50 lb)', qty: 2 },
    { item: 'Grout 25 lb (bag)', qty: 1 },
    { item: 'Caulking', qty: 2 },
  ],
  'Walk-in Shower (Large)': [
    { item: 'GoBoard 1/2" (3x5)', qty: 14 },
    { item: 'GoBoard Sealant', qty: 4 },
    { item: 'GoBoard Caps & Screws', qty: 2 },
    { item: 'Thinset - 253 Gold (50 lb)', qty: 3 },
    { item: 'Grout 25 lb (bag)', qty: 1 },
    { item: 'Caulking', qty: 3 },
  ],
}

// Synthesize a constant-quantity formula list from the legacy hardcoded
// table so a template missing materials_formula can still render. Each entry
// becomes `{ formula: "<qty>", min: <qty>, max: <qty> }` — the formula is
// just a literal number, the clamp ensures it stays put regardless of sqft.
function synthesizeLegacyFormulas(name: string): MaterialFormulaEntry[] {
  const legacy = TEMPLATE_MATERIALS[name as TemplateName]
  if (!legacy) return []
  return legacy.map((m) => ({
    item: m.item,
    formula: String(m.qty),
    min: m.qty,
    max: m.qty,
  }))
}

// Backward-compatible single-template entry point. Wraps the new multi-scope
// engine by synthesizing a single scope. Callers using this function get
// identical pre-formula behavior for templates without seeded formulas; once
// migration 022 has been applied, they get the formula-driven quantities.
export function generateEstimate(
  template: JobTemplateRow,
  catalog: MaterialCatalogRow[],
  laborRates: LaborRateRow[],
  operatingCosts: OperatingCostRow[],
  opts: GenerateOptions = {}
): GenerateResult {
  // Hydrate the template with synthetic formulas if it has none yet. Keeps
  // the scopes engine strict about requiring formulas while letting legacy
  // call sites keep working.
  const hydrated: ScopedTemplate = {
    ...template,
    materials_formula:
      template.materials_formula && template.materials_formula.length > 0
        ? template.materials_formula
        : synthesizeLegacyFormulas(template.template_name),
    labor_formula: template.labor_formula ?? null,
  }

  const scope: JobScope = {
    id: 'scope_01',
    label: template.template_name,
    template_name: template.template_name,
    sqft: opts.sqft ?? null,
    sub_sqft: opts.sub_sqft,
    customer_provides: opts.customer_provides ?? ['tile'],
  }

  return generateFromScopes(
    [scope],
    [hydrated],
    catalog,
    laborRates,
    operatingCosts,
    { warranty_years: opts.warranty_years }
  )
}

// Re-export the new types so callers can import them from the same module.
export type { JobScope, ScopedTemplate } from '@/lib/estimator/scopes'
