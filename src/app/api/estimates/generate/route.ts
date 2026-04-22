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

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface GenerateBody {
  job_id: string
  template_name: string
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

  if (!body.job_id || !body.template_name) {
    return NextResponse.json(
      { error: 'job_id and template_name required' },
      { status: 400 }
    )
  }

  const supabase = getSupabase()

  // Load everything in parallel
  const [jobRes, templateRes, catalogRes, laborRes, costsRes] = await Promise.all([
    supabase.from('jobs').select('*').eq('id', body.job_id).single(),
    supabase
      .from('job_templates')
      .select('template_name, job_type, typical_sqft_low, typical_sqft_high, demo_days, install_days, typical_materials')
      .eq('template_name', body.template_name)
      .single(),
    supabase
      .from('materials_pricing')
      .select('id, item, category, your_cost, price_to_customer, unit, coverage, retail_link'),
    supabase.from('labor_rates').select('setting, value'),
    supabase.from('operating_costs').select('setting, value'),
  ])

  if (jobRes.error || !jobRes.data) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  if (templateRes.error || !templateRes.data) {
    return NextResponse.json(
      { error: `Template "${body.template_name}" not found` },
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

  const result = generateEstimate(
    templateRes.data as JobTemplateRow,
    (catalogRes.data ?? []) as MaterialCatalogRow[],
    (laborRes.data ?? []) as LaborRateRow[],
    (costsRes.data ?? []) as OperatingCostRow[],
    {
      sqft: body.sqft ?? null,
      customer_provides: body.customer_provides,
      warranty_years: body.warranty_years ?? 3,
    }
  )

  // Persist — PATCH logic auto-syncs estimated_cost from line_items sum
  const { data: updated, error: updateError } = await supabase
    .from('jobs')
    .update({
      line_items: result.line_items,
      scope_notes: result.scope_notes,
      estimated_cost: result.total,
      estimated_days: Math.max(1, Math.round(result.labor_days)),
      customer_provides:
        body.customer_provides && body.customer_provides.length > 0
          ? body.customer_provides.join(', ')
          : job.customer_provides,
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
    },
  })
}
