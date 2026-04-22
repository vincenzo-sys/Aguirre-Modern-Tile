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
  description?: string
} & Record<string, string>

type InferResult =
  | { kind: 'confident'; template: TemplateName; sqft: number }
  | { kind: 'needs_site_visit'; reason: string }
  | { kind: 'no_template'; reason: string }

// Detect free-text signals that a lead describes a repair / site-visit
// situation rather than a standard project we can template against.
// Dorothy's lead (2026-04-22) was the canonical case that taught us this.
function detectRepairKeywords(text: string): string | null {
  const t = text.toLowerCase()
  const repairHits = ['regrout', 're-grout', 'crumbling', 'grout is', 'grout loose', 'grout missing']
  const visitHits = ['assessment', 'come take a look', 'in-person', 'in person', 'look at it', 'look it over']
  const movementHits = ['creaking', 'moving', 'movement', 'loose tile', 'loose tiles', 'tile came up', 'tiles came up']

  for (const h of repairHits) if (t.includes(h)) return `mentions repair/regrout ("${h}")`
  for (const h of movementHits) if (t.includes(h)) return `mentions tile movement ("${h}")`
  for (const h of visitHits) if (t.includes(h)) return `customer requested in-person visit ("${h}")`
  return null
}

// Decide if we have enough structured data to auto-estimate. If not, we
// refuse to run the estimator — the lead lands as a regular job with an
// empty line_items array, so Vince can review before committing numbers.
function inferTemplate(
  projectType: string | null,
  answers: LeadAnswers
): InferResult {
  const scope = (answers.projectScope ?? '').toLowerCase()
  const shower = (answers.showerIncluded ?? '').toLowerCase()
  const size = (answers.size ?? '').toLowerCase()
  const type = (projectType ?? '').toLowerCase()
  const description = (answers.description ?? answers.extras ?? '').toLowerCase()

  // Gate 1: repair / site-visit keywords in free text → refuse auto-estimate
  const repairReason = detectRepairKeywords(description)
  if (repairReason) {
    return { kind: 'needs_site_visit', reason: repairReason }
  }

  // Gate 2: no structured data AND not a clear project_type → refuse
  const hasStructured = Boolean(scope || shower || size)
  const hasClearType = ['bathroom', 'shower', 'backsplash', 'kitchen-floor'].includes(type)
  if (!hasStructured && !hasClearType) {
    return {
      kind: 'no_template',
      reason: `project_type='${projectType ?? 'none'}' with no structured answers — can't pick a template safely`,
    }
  }

  const sqftBySize: Record<string, number> = {
    small: 50,
    medium: 100,
    large: 150,
    master: 200,
    unsure: 100,
  }
  const sqft = sqftBySize[size] ?? 100

  if (type === 'backsplash') {
    const template: TemplateName =
      sqft > 35 ? 'Backsplash (Large/Complex)' : 'Backsplash (Standard)'
    return { kind: 'confident', template, sqft }
  }

  if (type === 'kitchen-floor' || scope === 'floor-only') {
    const template: TemplateName =
      sqft > 50 ? 'Bathroom Floor (Medium)' : 'Bathroom Floor (Small)'
    return { kind: 'confident', template, sqft }
  }

  if (type === 'shower' || scope === 'walls-only' || shower === 'shower-only') {
    const template: TemplateName = sqft > 130 ? 'Walk-in Shower (Large)' : 'Walk-in Shower (Small)'
    return { kind: 'confident', template, sqft }
  }

  if (shower === 'yes' || scope === 'full-remodel' || scope === 'floor-and-walls') {
    return { kind: 'confident', template: 'Tub Surround + Bathroom Floor', sqft: Math.max(sqft, 120) }
  }

  if (scope === 'walls-only') {
    return { kind: 'confident', template: 'Standard Tub Surround', sqft: Math.max(sqft, 80) }
  }

  // Bathroom type with some structured data but ambiguous combo → still
  // refuse. Better to show the lead detail than invent a number.
  return {
    kind: 'no_template',
    reason: 'bathroom type but projectScope/shower not specific enough',
  }
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
  const inference = inferTemplate(lead.project_type, answers)
  const canAutoEstimate = inference.kind === 'confident'

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

  const projectTypeLabel = mapProjectTypeToJobType(lead.project_type)
  const baseTitle = `${titleCase(lead.client_name ?? 'New')} — ${projectTypeLabel}`

  // If we can't confidently pick a template, create the job *without* an
  // auto-estimate. Vince can click Generate Estimate on the job detail
  // once he's reviewed the lead or done a site visit.
  if (!canAutoEstimate) {
    const isRepair = inference.kind === 'needs_site_visit'
    const title = isRepair
      ? `${baseTitle.replace(/ — .*/, '')} — Assessment Needed`
      : baseTitle
    const reasonLine =
      inference.kind === 'needs_site_visit'
        ? `Flagged: ${inference.reason}. Customer likely wants an in-person assessment before an estimate.`
        : `Flagged: ${inference.reason}. Not enough structured data to auto-seed an estimate.`

    const baseScope = [
      'NEEDS REVIEW',
      '',
      reasonLine,
      '',
      answers.description ? `Customer said:\n"${answers.description}"` : '',
      '',
      'No line items seeded. Open this job and click "Generate estimate" once scope is clear, or schedule a site visit first.',
    ]
      .filter((l) => l !== '')
      .join('\n')

    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .insert({
        title,
        client_name: lead.client_name,
        client_phone: lead.client_phone,
        client_email: lead.client_email,
        customer_id: customerId,
        job_type: isRepair ? 'Repair' : (projectTypeLabel.split(' ')[0] ?? 'Tile'),
        status: 'lead',
        scope_notes: baseScope,
        next_contact_date: new Date().toISOString().slice(0, 10),
      })
      .select()
      .single()

    if (jobErr || !job) {
      return NextResponse.json(
        { error: jobErr?.message ?? 'Failed to create job' },
        { status: 500 }
      )
    }

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
      template_used: null,
      auto_estimated: false,
      reason: inference.reason,
      summary: {
        total: 0,
        deposit: 0,
        labor_days: 0,
        margin_percent: 0,
        line_item_count: 0,
        message:
          inference.kind === 'needs_site_visit'
            ? 'Site visit recommended before estimating'
            : 'Review needed — not enough info to auto-estimate',
      },
    })
  }

  // Confident path — run the estimator as before
  const { template, sqft } = inference
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

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      title: baseTitle,
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
    auto_estimated: true,
    summary: {
      total: result.total,
      deposit: result.deposit,
      labor_days: result.labor_days,
      margin_percent: result.margin_percent,
      line_item_count: result.line_items.length,
    },
  })
}
