import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiAuth } from '@/lib/apiAuth'
import type { JobLineItem } from '@/lib/supabase/types'

// Builds a clipboard-ready text block for pasting into Claude Desktop.
// The block is pure markdown, deliberately information-dense — every
// field is labelled so Claude can parse it without ambiguity. No AI on
// the platform; this endpoint just aggregates and formats.
//
// GET /api/context?lead_id=... OR GET /api/context?job_id=...

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function formatAnswers(answers: Record<string, unknown> | null): string {
  if (!answers) return '_(none)_'
  const entries = Object.entries(answers).filter(([, v]) => v !== null && v !== undefined && v !== '')
  if (entries.length === 0) return '_(none)_'
  return entries
    .map(([k, v]) => `- **${k}**: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n')
}

function formatDate(iso: string | null): string {
  if (!iso) return '_(unknown)_'
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatMoney(n: number | null): string {
  if (n === null || n === undefined) return '_(unset)_'
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

async function buildLeadContext(supabase: ReturnType<typeof getSupabase>, leadId: string): Promise<string | null> {
  const { data: lead, error } = await supabase
    .from('quote_requests')
    .select('*')
    .eq('id', leadId)
    .single()
  if (error || !lead) return null

  // Customer + prior jobs
  let customerName = lead.client_name
  let customerSummary = ''
  let priorJobCount = 0
  let priorRevenue = 0

  if (lead.customer_id) {
    const [{ data: customer }, { data: jobs }] = await Promise.all([
      supabase.from('customers').select('*').eq('id', lead.customer_id).single(),
      supabase.from('jobs').select('estimated_cost, amount_paid, status, title').eq('customer_id', lead.customer_id),
    ])
    if (customer) {
      customerName = customer.name
      customerSummary = [
        customer.address && `${customer.address}${customer.city ? ', ' + customer.city : ''}${customer.state ? ', ' + customer.state : ''} ${customer.zip ?? ''}`.trim(),
        customer.notes && `Notes: ${customer.notes}`,
      ]
        .filter(Boolean)
        .join('\n')
    }
    priorJobCount = jobs?.length ?? 0
    priorRevenue = (jobs ?? []).reduce((s, j) => s + Number(j.amount_paid ?? 0), 0)
  }

  // Photos from quote form
  const { data: photos } = await supabase
    .from('quote_request_photos')
    .select('storage_path, file_name')
    .eq('quote_request_id', leadId)
  const photoCount = photos?.length ?? 0

  const lines: string[] = []
  lines.push(`# Lead Context — ${customerName ?? 'Unknown'}`)
  lines.push('')
  lines.push(`**Lead ID**: \`${lead.id}\``)
  lines.push(`**Submitted**: ${formatDate(lead.created_at)}`)
  lines.push(`**Source**: ${lead.source ?? 'website'}`)
  lines.push(`**Project type**: ${lead.project_type ?? '_(unspecified)_'}`)
  lines.push(`**Status**: ${lead.status}`)
  if (lead.converted_job_id) {
    lines.push(`**Already converted to job**: \`${lead.converted_job_id}\``)
  }
  lines.push('')
  lines.push('## Customer')
  lines.push(`- **Name**: ${lead.client_name}`)
  if (lead.client_phone) lines.push(`- **Phone**: ${lead.client_phone}`)
  if (lead.client_email) lines.push(`- **Email**: ${lead.client_email}`)
  if (customerSummary) {
    lines.push(customerSummary)
  }
  if (priorJobCount > 0) {
    lines.push(`- **Prior jobs with us**: ${priorJobCount} (${formatMoney(priorRevenue)} lifetime)`)
  }
  lines.push('')
  lines.push('## Customer answers from quote form')
  lines.push(formatAnswers(lead.answers as Record<string, unknown> | null))
  lines.push('')
  if (lead.notes) {
    lines.push('## Internal notes on this lead')
    lines.push(lead.notes)
    lines.push('')
  }
  if (lead.site_visit_at) {
    lines.push(`## Site visit scheduled`)
    lines.push(`- ${formatDate(lead.site_visit_at)}`)
    if (lead.site_visit_notes) lines.push(`- Notes: ${lead.site_visit_notes}`)
    lines.push('')
  }
  lines.push(`## Photos uploaded`)
  lines.push(
    photoCount === 0
      ? '_(none)_'
      : `${photoCount} photo${photoCount === 1 ? '' : 's'} attached to the lead (view them at \`/dashboard/leads/${lead.id}\`)`
  )
  lines.push('')
  lines.push('---')
  lines.push(
    '_Paste into Claude Desktop. Claude can use MCP tools to read the materials catalog, pick a template, and write line_items back to the job._'
  )

  return lines.join('\n')
}

async function buildJobContext(supabase: ReturnType<typeof getSupabase>, jobId: string): Promise<string | null> {
  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single()
  if (error || !job) return null

  const lineItems: JobLineItem[] = Array.isArray(job.line_items) ? job.line_items : []
  const materials = lineItems.filter((i) => i.category === 'materials')
  const labor = lineItems.filter((i) => i.category === 'labor')
  const total = lineItems.reduce((s: number, i) => s + Number(i.amount ?? 0), 0)

  let customerName = job.client_name
  let customerSummary = ''
  if (job.customer_id) {
    const { data: customer } = await supabase.from('customers').select('*').eq('id', job.customer_id).single()
    if (customer) {
      customerName = customer.name
      customerSummary = [
        customer.address && `${customer.address}${customer.city ? ', ' + customer.city : ''}${customer.state ? ', ' + customer.state : ''} ${customer.zip ?? ''}`.trim(),
      ]
        .filter(Boolean)
        .join('\n')
    }
  }

  // Originating lead
  let leadSnippet = ''
  const { data: lead } = await supabase
    .from('quote_requests')
    .select('id, answers, project_type, source')
    .eq('converted_job_id', jobId)
    .limit(1)
    .single()
  if (lead) {
    leadSnippet = `\n## Originating lead\n- ID: \`${lead.id}\`\n- Project type: ${lead.project_type ?? '_(none)_'}\n- Source: ${lead.source ?? 'website'}\n\n### Customer answers on lead\n${formatAnswers(lead.answers as Record<string, unknown> | null)}`
  }

  const lines: string[] = []
  lines.push(`# Job Context — #${job.job_number}: ${job.title}`)
  lines.push('')
  lines.push(`**Job ID**: \`${job.id}\``)
  lines.push(`**Status**: ${job.status}`)
  lines.push(`**Job type**: ${job.job_type ?? '_(unspecified)_'}`)
  if (job.square_footage) lines.push(`**Square footage**: ${job.square_footage}`)
  if (job.estimated_days) lines.push(`**Estimated days**: ${job.estimated_days}`)
  lines.push(`**Estimated cost**: ${formatMoney(job.estimated_cost)}`)
  if (job.amount_paid) lines.push(`**Amount paid**: ${formatMoney(job.amount_paid)}`)
  if (job.scheduled_start) lines.push(`**Scheduled start**: ${job.scheduled_start}`)
  lines.push('')
  lines.push('## Customer')
  lines.push(`- **Name**: ${customerName}`)
  if (job.client_phone) lines.push(`- **Phone**: ${job.client_phone}`)
  if (job.client_email) lines.push(`- **Email**: ${job.client_email}`)
  if (customerSummary) lines.push(customerSummary)
  lines.push('')
  if (job.scope_notes) {
    lines.push('## Scope notes')
    lines.push(job.scope_notes)
    lines.push('')
  }
  if (job.customer_provides) {
    lines.push(`## Customer is providing`)
    lines.push(job.customer_provides)
    lines.push('')
  }
  if (job.crew_instructions) {
    lines.push('## Crew instructions')
    lines.push(job.crew_instructions)
    lines.push('')
  }
  lines.push('## Line items')
  if (lineItems.length === 0) {
    lines.push('_No line items yet._ Use Generate Estimate (template), Claude Desktop (MCP), or build manually.')
  } else {
    lines.push(`**Total**: ${formatMoney(total)} · ${labor.length} labor · ${materials.length} materials`)
    lines.push('')
    lines.push('| # | Category | Description | Qty | Unit | Unit $ | Amount |')
    lines.push('|---|---|---|---|---|---|---|')
    lineItems.forEach((i: JobLineItem, idx: number) => {
      lines.push(
        `| ${idx + 1} | ${i.category} | ${i.description} | ${i.quantity} | ${i.unit} | ${formatMoney(Number(i.unit_price))} | ${formatMoney(Number(i.amount))} |`
      )
    })
  }
  lines.push('')
  if (leadSnippet) lines.push(leadSnippet)
  lines.push('')
  lines.push('---')
  lines.push(
    '_Paste into Claude Desktop to update pricing, scope, or line_items via MCP against this job id._'
  )

  return lines.join('\n')
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const leadId = searchParams.get('lead_id')
  const jobId = searchParams.get('job_id')

  if (!leadId && !jobId) {
    return NextResponse.json(
      { error: 'Pass lead_id or job_id as query param' },
      { status: 400 }
    )
  }

  const supabase = getSupabase()

  const text = leadId
    ? await buildLeadContext(supabase, leadId)
    : await buildJobContext(supabase, jobId as string)

  if (!text) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return new NextResponse(text, {
    status: 200,
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  })
}
