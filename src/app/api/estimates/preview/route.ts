import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiAuth } from '@/lib/apiAuth'
import type {
  MaterialCatalogRow,
  LaborRateRow,
  OperatingCostRow,
} from '@/lib/estimator'
import { generateFromScopes, type JobScope, type ScopedTemplate } from '@/lib/estimator/scopes'

// Read-only sibling of /api/estimates/generate. Runs the same engine but
// never writes to the DB — used by the modal to show a live total +
// margin as the user changes scopes/sqft/addons. Skips the
// hasExistingItems check (the modal already knows that).
//
// Returns the same `summary` shape as generate so the modal can drop in
// without translating fields.

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface ScopeBody {
  id?: string
  label?: string
  template_name: string
  sqft?: number | null
  sub_sqft?: Record<string, number>
  addons?: Record<string, boolean | number>
  customer_provides?: string[]
}

interface PreviewBody {
  scopes?: ScopeBody[]
  template_name?: string
  sqft?: number | null
  sub_sqft?: Record<string, number>
  customer_provides?: string[]
  warranty_years?: number
  // Skip miles in preview — round trips dominate when no address is
  // available, and the modal can't be sure of the customer address yet.
  // The caller can pass a value if they want it included.
  transportation_miles_one_way?: number | null
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  let body: PreviewBody
  try {
    body = (await req.json()) as PreviewBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const scopesInput: ScopeBody[] =
    Array.isArray(body.scopes) && body.scopes.length > 0
      ? body.scopes
      : body.template_name
        ? [{
            template_name: body.template_name,
            label: body.template_name,
            sqft: body.sqft ?? null,
            sub_sqft: body.sub_sqft,
            customer_provides: body.customer_provides,
          }]
        : []

  if (scopesInput.length === 0) {
    return NextResponse.json(
      { error: 'Provide either scopes[] or template_name' },
      { status: 400 }
    )
  }

  // Skip preview entirely when no sqft/sub_sqft is filled in yet — saves
  // a DB round-trip on every keystroke, and the modal shows a "—" placeholder
  // when no preview is returned. We still preview if at least one scope
  // has a measurement, even if others don't.
  const hasAnyMeasurement = scopesInput.some(
    (s) =>
      (s.sqft && s.sqft > 0) ||
      (s.sub_sqft && Object.values(s.sub_sqft).some((v) => Number(v) > 0))
  )
  if (!hasAnyMeasurement) {
    return NextResponse.json({ summary: null, reason: 'no_measurement' })
  }

  const supabase = getSupabase()
  const requestedTemplates = Array.from(new Set(scopesInput.map((s) => s.template_name)))

  const [templatesRes, catalogRes, laborRes, costsRes] = await Promise.all([
    supabase
      .from('job_templates')
      .select('template_name, job_type, typical_sqft_low, typical_sqft_high, demo_days, install_days, typical_materials, materials_formula, labor_formula, sub_areas, addons')
      .in('template_name', requestedTemplates),
    supabase
      .from('materials_pricing')
      .select('id, item, category, your_cost, price_to_customer, unit, coverage, retail_link'),
    supabase.from('labor_rates').select('setting, value'),
    supabase.from('operating_costs').select('setting, value'),
  ])

  const templates = (templatesRes.data ?? []) as ScopedTemplate[]
  const missing = requestedTemplates.filter((n) => !templates.find((t) => t.template_name === n))
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Template(s) not found: ${missing.join(', ')}` },
      { status: 404 }
    )
  }

  const scopes: JobScope[] = scopesInput.map((s, idx) => ({
    id: s.id ?? `scope_${String(idx + 1).padStart(2, '0')}`,
    label: s.label?.trim() || `${s.template_name} #${idx + 1}`,
    template_name: s.template_name,
    sqft: s.sqft ?? null,
    sub_sqft: s.sub_sqft,
    addons: s.addons,
    customer_provides: s.customer_provides,
  }))

  try {
    const result = generateFromScopes(
      scopes,
      templates,
      (catalogRes.data ?? []) as MaterialCatalogRow[],
      (laborRes.data ?? []) as LaborRateRow[],
      (costsRes.data ?? []) as OperatingCostRow[],
      {
        warranty_years: body.warranty_years ?? 3,
        transportation_miles_one_way: body.transportation_miles_one_way ?? null,
      }
    )
    return NextResponse.json({
      summary: {
        total: result.total,
        deposit: result.deposit,
        labor_days: result.labor_days,
        demo_days: result.demo_days,
        install_days: result.install_days,
        margin_percent: result.margin_percent,
        line_item_count: result.line_items.length,
        scope_count: scopes.length,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Preview failed' },
      { status: 422 }
    )
  }
}
