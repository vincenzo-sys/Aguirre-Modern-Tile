import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiAuth } from '@/lib/apiAuth'
import { generateEstimate } from '@/lib/estimator'
import type {
  MaterialCatalogRow,
  LaborRateRow,
  OperatingCostRow,
  JobTemplateRow,
  TemplateName,
} from '@/lib/estimator'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type LeadAnswers = {
  projectScope?: string
  showerIncluded?: string
  size?: string
  existingTile?: string
  extras?: string
} & Record<string, string>

// Infer a sensible Generate-Estimate template from a quote_request's
// project_type + answers. Ambiguity falls back to the nearest common
// template for that project type so we always produce *something*.
function inferTemplate(
  projectType: string | null,
  answers: LeadAnswers
): { template: TemplateName; sqft: number } {
  const scope = (answers.projectScope ?? '').toLowerCase()
  const shower = (answers.showerIncluded ?? '').toLowerCase()
  const size = (answers.size ?? '').toLowerCase()

  const sqftBySize: Record<string, number> = {
    small: 50,
    medium: 100,
    large: 150,
    master: 200,
    unsure: 100,
  }
  const sqft = sqftBySize[size] ?? 100

  const type = (projectType ?? '').toLowerCase()

  if (type === 'backsplash') {
    const template: TemplateName =
      sqft > 35 ? 'Backsplash (Large/Complex)' : 'Backsplash (Standard)'
    return { template, sqft }
  }

  if (type === 'kitchen-floor' || scope === 'floor-only') {
    const template: TemplateName =
      sqft > 50 ? 'Bathroom Floor (Medium)' : 'Bathroom Floor (Small)'
    return { template, sqft }
  }

  if (type === 'shower' || scope === 'walls-only' || shower === 'shower-only') {
    const template: TemplateName = sqft > 130 ? 'Walk-in Shower (Large)' : 'Walk-in Shower (Small)'
    return { template, sqft }
  }

  // Bathroom full-remodel / floor-and-walls / default
  if (shower === 'yes' || scope === 'full-remodel' || scope === 'floor-and-walls') {
    return { template: 'Tub Surround + Bathroom Floor', sqft: Math.max(sqft, 120) }
  }

  // Walls + no shower means tub surround
  if (scope === 'walls-only') {
    return { template: 'Standard Tub Surround', sqft: Math.max(sqft, 80) }
  }

  // Safe default
  return { template: 'Tub Surround + Bathroom Floor', sqft }
}

function mapProjectTypeToJobType(projectType: string | null): string {
  const map: Record<string, string> = {
    bathroom: 'Bathroom Tile',
    shower: 'Shower Tile',
    'kitchen-floor': 'Floor Tile',
    backsplash: 'Backsplash',
  }
  return map[(projectType ?? '').toLowerCase()] || 'Tile'
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  const { id: leadId } = await params
  const supabase = getSupabase()

  const { data: lead, error: leadErr } = await supabase
    .from('quote_requests')
    .select('*')
    .eq('id', leadId)
    .single()

  if (leadErr || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  if (lead.converted_job_id) {
    return NextResponse.json(
      {
        error: 'Lead already converted',
        existing_job_id: lead.converted_job_id,
      },
      { status: 409 }
    )
  }

  const answers = (lead.answers ?? {}) as LeadAnswers
  const { template, sqft } = inferTemplate(lead.project_type, answers)

  // Customer: prefer explicit lead.customer_id; else find-or-create by phone/email
  let customerId: string | null = lead.customer_id ?? null
  if (!customerId) {
    if (lead.client_email) {
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .ilike('email', lead.client_email)
        .limit(1)
        .single()
      if (existing) customerId = existing.id
    }
    if (!customerId && lead.client_phone) {
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', lead.client_phone)
        .limit(1)
        .single()
      if (existing) customerId = existing.id
    }
    if (!customerId) {
      const { data: newCustomer } = await supabase
        .from('customers')
        .insert({
          name: lead.client_name,
          email: lead.client_email || null,
          phone: lead.client_phone || null,
          source: 'website',
        })
        .select('id')
        .single()
      if (newCustomer) customerId = newCustomer.id
    }
  }

  // Load estimator inputs in parallel
  const [templateRes, catalogRes, laborRes, costsRes] = await Promise.all([
    supabase
      .from('job_templates')
      .select('template_name, job_type, typical_sqft_low, typical_sqft_high, demo_days, install_days, typical_materials')
      .eq('template_name', template)
      .single(),
    supabase
      .from('materials_pricing')
      .select('id, item, category, your_cost, price_to_customer, unit, coverage, retail_link'),
    supabase.from('labor_rates').select('setting, value'),
    supabase.from('operating_costs').select('setting, value'),
  ])

  if (templateRes.error || !templateRes.data) {
    return NextResponse.json(
      { error: `Inferred template "${template}" not found in job_templates` },
      { status: 500 }
    )
  }

  const result = generateEstimate(
    templateRes.data as JobTemplateRow,
    (catalogRes.data ?? []) as MaterialCatalogRow[],
    (laborRes.data ?? []) as LaborRateRow[],
    (costsRes.data ?? []) as OperatingCostRow[],
    { sqft, customer_provides: ['tile'], warranty_years: 3 }
  )

  const projectTypeLabel = mapProjectTypeToJobType(lead.project_type)
  const jobTitle = `${titleCase(lead.client_name ?? 'New')} — ${projectTypeLabel}`

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      title: jobTitle,
      client_name: lead.client_name,
      client_phone: lead.client_phone,
      client_email: lead.client_email,
      customer_id: customerId,
      job_type: projectTypeLabel.split(' ')[0] ?? 'Tile',
      status: 'lead',
      square_footage: sqft,
      scope_notes: result.scope_notes,
      customer_provides: 'tile',
      estimated_cost: result.total,
      estimated_days: Math.max(1, Math.round(result.labor_days)),
      line_items: result.line_items,
    })
    .select()
    .single()

  if (jobErr || !job) {
    return NextResponse.json(
      { error: jobErr?.message ?? 'Failed to create job' },
      { status: 500 }
    )
  }

  // Mark the lead converted + reviewed
  await supabase
    .from('quote_requests')
    .update({
      converted_job_id: job.id,
      status: 'reviewed',
      last_contact_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  return NextResponse.json({
    job,
    template_used: template,
    summary: {
      total: result.total,
      deposit: result.deposit,
      labor_days: result.labor_days,
      margin_percent: result.margin_percent,
      line_item_count: result.line_items.length,
    },
  })
}
