import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiAuth } from '@/lib/apiAuth'
import { generateEstimate } from '@/lib/estimator'
import type {
  MaterialCatalogRow,
  LaborRateRow,
  OperatingCostRow,
  JobTemplateRow,
} from '@/lib/estimator'
import { generateFromScopes, type JobScope, type ScopedTemplate } from '@/lib/estimator/scopes'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Accepts two body shapes:
//
//  1. New (multi-scope):
//     { job_id, scopes: [{label, template_name, sqft?, addons?, customer_provides?}, ...],
//       warranty_years?, overwrite? }
//
//  2. Legacy (single template, kept so existing callers keep working):
//     { job_id, template_name, sqft?, customer_provides?, warranty_years?, overwrite? }
//     — internally coerced to a single-scope request.
interface ScopeBody {
  id?: string
  label?: string
  template_name: string
  sqft?: number | null
  addons?: Record<string, boolean | number>
  customer_provides?: string[]
}

interface GenerateBody {
  job_id: string
  scopes?: ScopeBody[]
  template_name?: string
  sqft?: number | null
  customer_provides?: string[]
  warranty_years?: number
  overwrite?: boolean
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  let body: GenerateBody
  try {
    body = (await req.json()) as GenerateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.job_id) {
    return NextResponse.json({ error: 'job_id required' }, { status: 400 })
  }

  // Normalize: legacy single-template body → one-scope body. Either way we
  // end up with a non-empty scopes array.
  const scopesInput: ScopeBody[] = Array.isArray(body.scopes) && body.scopes.length > 0
    ? body.scopes
    : body.template_name
      ? [{
          template_name: body.template_name,
          label: body.template_name,
          sqft: body.sqft ?? null,
          customer_provides: body.customer_provides,
        }]
      : []

  if (scopesInput.length === 0) {
    return NextResponse.json(
      { error: 'Provide either scopes[] or template_name' },
      { status: 400 }
    )
  }

  const supabase = getSupabase()

  // Pull the unique template names this request needs so we can filter the
  // templates query (avoids loading all templates for a one-template estimate).
  const requestedTemplates = Array.from(new Set(scopesInput.map((s) => s.template_name)))

  const [jobRes, templatesRes, catalogRes, laborRes, costsRes] = await Promise.all([
    supabase.from('jobs').select('*').eq('id', body.job_id).single(),
    supabase
      .from('job_templates')
      .select('template_name, job_type, typical_sqft_low, typical_sqft_high, demo_days, install_days, typical_materials, materials_formula, labor_formula')
      .in('template_name', requestedTemplates),
    supabase
      .from('materials_pricing')
      .select('id, item, category, your_cost, price_to_customer, unit, coverage, retail_link'),
    supabase.from('labor_rates').select('setting, value'),
    supabase.from('operating_costs').select('setting, value'),
  ])

  if (jobRes.error || !jobRes.data) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  const templates = (templatesRes.data ?? []) as ScopedTemplate[]
  const missing = requestedTemplates.filter((n) => !templates.find((t) => t.template_name === n))
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Template(s) not found: ${missing.join(', ')}` },
      { status: 404 }
    )
  }

  const job = jobRes.data
  const hasExistingItems = Array.isArray(job.line_items) && job.line_items.length > 0
  if (hasExistingItems && !body.overwrite) {
    return NextResponse.json(
      {
        error: 'Job already has line items. Pass overwrite: true to replace.',
        existing_line_item_count: job.line_items.length,
      },
      { status: 409 }
    )
  }

  // Build the canonical scopes array (with ids and labels filled in).
  const scopes: JobScope[] = scopesInput.map((s, idx) => ({
    id: s.id ?? `scope_${String(idx + 1).padStart(2, '0')}`,
    label: s.label?.trim() || `${s.template_name} #${idx + 1}`,
    template_name: s.template_name,
    sqft: s.sqft ?? null,
    addons: s.addons,
    customer_provides: s.customer_provides,
  }))

  let result
  try {
    // Single-scope legacy bodies still go through generateEstimate so the
    // synthetic-formula fallback handles templates that haven't been migrated.
    // Multi-scope bodies require formulas (migration 022 backfilled them).
    if (scopes.length === 1 && !Array.isArray(body.scopes)) {
      result = generateEstimate(
        templates[0] as JobTemplateRow,
        (catalogRes.data ?? []) as MaterialCatalogRow[],
        (laborRes.data ?? []) as LaborRateRow[],
        (costsRes.data ?? []) as OperatingCostRow[],
        {
          sqft: scopes[0].sqft ?? null,
          customer_provides: scopes[0].customer_provides,
          warranty_years: body.warranty_years ?? 3,
        }
      )
    } else {
      result = generateFromScopes(
        scopes,
        templates,
        (catalogRes.data ?? []) as MaterialCatalogRow[],
        (laborRes.data ?? []) as LaborRateRow[],
        (costsRes.data ?? []) as OperatingCostRow[],
        { warranty_years: body.warranty_years ?? 3 }
      )
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Estimate generation failed' },
      { status: 422 }
    )
  }

  const customerProvidesText = (() => {
    const all = new Set<string>()
    for (const s of scopes) for (const cp of s.customer_provides ?? []) all.add(cp)
    if (all.size === 0) return job.customer_provides
    return Array.from(all).join(', ')
  })()

  const { data: updated, error: updateError } = await supabase
    .from('jobs')
    .update({
      line_items: result.line_items,
      scope_notes: result.scope_notes,
      scopes: scopes,
      estimated_cost: result.total,
      estimated_days: Math.max(1, Math.round(result.labor_days)),
      customer_provides: customerProvidesText,
    })
    .eq('id', body.job_id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    job: updated,
    summary: {
      total: result.total,
      deposit: result.deposit,
      labor_days: result.labor_days,
      margin_percent: result.margin_percent,
      line_item_count: result.line_items.length,
      scope_count: scopes.length,
    },
  })
}
