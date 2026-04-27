import { createClient } from '@supabase/supabase-js'
import { FileText, AlertTriangle } from 'lucide-react'

// Server component — read-only review of every template in the catalog.
// One card per template showing the bill of materials with each formula
// resolved against the live materials_pricing rows so you can spot drift
// (formula's effective coverage vs catalog coverage) and make sure the
// templates still describe how Aguirre actually buys materials.
//
// Editing is intentionally out of scope here. When you find drift, edit
// the template via SQL or the existing /dashboard/settings Templates tab
// and refresh. A full inline editor is a future expansion.

interface MaterialFormulaEntry {
  item: string
  formula: string
  min?: number
  max?: number
  applies_when?: string
}
interface SubArea {
  key: string
  label: string
  hint?: string
  default_share?: number
}
interface Addon {
  key: string
  label: string
  hint?: string
  default?: boolean
}
interface JobTemplate {
  template_name: string
  job_type: string | null
  typical_sqft_low: number | null
  typical_sqft_high: number | null
  demo_days: number | null
  install_days: number | null
  materials_formula: MaterialFormulaEntry[] | null
  sub_areas: SubArea[] | null
  addons: Addon[] | null
}
interface CatalogRow {
  item: string
  category: string | null
  unit: string
  coverage: number | string | null
  price_to_customer: number | string | null
  your_cost: number | string | null
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Pull the divisor out of formulas like "ceil(sqft / 12)" or
// "ceil(sub_sqft.walls / 35)" so we can compare against catalog coverage.
// Returns null for non-divisor formulas (constants like "1" or "2").
function effectiveCoverage(formula: string): number | null {
  const m = formula.match(/\/\s*([\d.]+)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

// Find the catalog row that the formula entry references — same loose
// matching the engine uses (exact match preferred, then substring).
function matchCatalog(itemName: string, catalog: CatalogRow[]): CatalogRow | null {
  const norm = itemName.toLowerCase().replace(/\s+/g, ' ').trim()
  const exact = catalog.find((r) => r.item.toLowerCase().replace(/\s+/g, ' ').trim() === norm)
  if (exact) return exact
  const candidates = catalog
    .filter((r) => norm.includes(r.item.toLowerCase()) || r.item.toLowerCase().includes(norm))
    .sort((a, b) => b.item.length - a.item.length)
  return candidates[0] ?? null
}

export default async function TemplatesReviewPage() {
  const supabase = getSupabase()
  const [templatesRes, catalogRes] = await Promise.all([
    supabase
      .from('job_templates')
      .select(
        'template_name, job_type, typical_sqft_low, typical_sqft_high, demo_days, install_days, materials_formula, sub_areas, addons'
      )
      .order('job_type', { ascending: true })
      .order('template_name', { ascending: true }),
    supabase
      .from('materials_pricing')
      .select('item, category, unit, coverage, price_to_customer, your_cost'),
  ])

  const templates = (templatesRes.data ?? []) as JobTemplate[]
  const catalog = (catalogRes.data ?? []) as CatalogRow[]

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-400" /> Templates
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Read-only review of every job template. Catalog coverage shown next to each template&apos;s
            effective coverage (the divisor in the formula). Drift is normal — templates often run
            tighter than catalog to account for waste — but big gaps are worth checking.
          </p>
        </div>
        <div className="text-xs text-gray-500">
          {templates.length} template{templates.length === 1 ? '' : 's'} · {catalog.length} catalog items
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {templates.map((t) => (
          <TemplateCard key={t.template_name} template={t} catalog={catalog} />
        ))}
      </div>
    </div>
  )
}

function TemplateCard({ template, catalog }: { template: JobTemplate; catalog: CatalogRow[] }) {
  const formulas = template.materials_formula ?? []
  const subAreas = template.sub_areas ?? []
  const addons = template.addons ?? []
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-900">{template.template_name}</h2>
          <span className="text-[10px] uppercase tracking-wider text-gray-500">{template.job_type}</span>
        </div>
        <p className="text-[11px] text-gray-500 mt-0.5">
          {template.typical_sqft_low}–{template.typical_sqft_high} sq ft typical · demo {template.demo_days ?? 0}d · install {template.install_days ?? 0}d
        </p>
      </div>

      {subAreas.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-100">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Sub-areas</div>
          <div className="flex flex-wrap gap-1.5">
            {subAreas.map((a) => (
              <span
                key={a.key}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-blue-50 text-blue-700 rounded"
              >
                {a.label}
                {a.default_share != null && (
                  <span className="text-blue-500">({Math.round(a.default_share * 100)}%)</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {addons.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-100">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Addons</div>
          <div className="flex flex-wrap gap-1.5">
            {addons.map((a) => (
              <span
                key={a.key}
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded ${
                  a.default ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {a.label}
                {a.default && <span className="text-emerald-500">default on</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
          Materials formula ({formulas.length})
        </div>
        {formulas.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No formula — falls back to legacy hardcoded quantities.</p>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
              <tr>
                <th className="text-left font-medium pb-1 pr-2">Item</th>
                <th className="text-left font-medium pb-1 pr-2">Formula</th>
                <th className="text-right font-medium pb-1 px-1">Cov</th>
                <th className="text-right font-medium pb-1 pl-1">Catalog</th>
                <th className="text-right font-medium pb-1 pl-2">$</th>
              </tr>
            </thead>
            <tbody>
              {formulas.map((entry, idx) => {
                const cat = matchCatalog(entry.item, catalog)
                const tmplCov = effectiveCoverage(entry.formula)
                const catalogCov = cat?.coverage != null ? Number(cat.coverage) : null
                const drift =
                  tmplCov != null && catalogCov != null && catalogCov > 1
                    ? Math.abs(tmplCov - catalogCov) / catalogCov
                    : null
                const driftHigh = drift != null && drift >= 0.25
                return (
                  <tr key={idx} className="border-b border-gray-50 last:border-0">
                    <td className="py-1.5 pr-2 align-top">
                      <div className="text-gray-900">{entry.item}</div>
                      {entry.applies_when && (
                        <div className="text-[10px] text-amber-600 mt-0.5">when {entry.applies_when}</div>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 align-top font-mono text-[10px] text-gray-600">
                      {entry.formula}
                      {entry.min != null && entry.max != null && entry.min !== entry.max && (
                        <span className="block text-[9px] text-gray-400">
                          [{entry.min}–{entry.max}]
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-1 text-right align-top">
                      {tmplCov ? (
                        <span className={driftHigh ? 'text-amber-700 font-medium' : 'text-gray-600'}>
                          {tmplCov}
                          {driftHigh && <AlertTriangle className="w-3 h-3 inline-block ml-0.5" />}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-1.5 pl-1 text-right align-top text-gray-500">
                      {catalogCov ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-1.5 pl-2 text-right align-top text-gray-500 whitespace-nowrap">
                      {cat ? `$${Number(cat.price_to_customer).toFixed(0)}` : <span className="text-red-500">missing</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
