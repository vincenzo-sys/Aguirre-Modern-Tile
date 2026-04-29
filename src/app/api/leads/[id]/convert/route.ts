import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiAuth } from '@/lib/apiAuth'
import { deriveQuoteHints } from '@/lib/quoteHints'

// Convert a quote_request into a job skeleton.
//
// Deliberately NOT auto-generating an estimate. Pricing is done via
// (a) the template-based "Generate Estimate" button on the job detail,
// (b) Claude Desktop + MCP against the dashboard, or (c) manual line-item
// editing. The platform never guesses at numbers — the Dorothy incident
// (2026-04-22) was the canonical case that taught us this.

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
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

function formatAnswersAsNotes(answers: Record<string, unknown> | null): string {
  if (!answers) return ''
  const entries = Object.entries(answers).filter(([, v]) => v !== null && v !== undefined && v !== '')
  if (entries.length === 0) return ''
  return entries
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n')
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
  const title = `${titleCase(lead.client_name ?? 'New')} — ${projectTypeLabel}`

  // Carry the raw lead context into scope_notes so Vince (or Claude
  // Desktop reading the job via MCP) has everything needed to price it.
  const notesSections = [
    'LEAD CONTEXT (from quote form)',
    '',
    `Source: ${lead.source ?? 'website'}`,
    `Project type: ${lead.project_type ?? '(unspecified)'}`,
    `Submitted: ${new Date(lead.created_at).toLocaleString('en-US')}`,
  ]
  const answersText = formatAnswersAsNotes(lead.answers)
  if (answersText) {
    notesSections.push('', 'Customer answers:', answersText)
  }
  if (lead.notes) {
    notesSections.push('', 'Internal notes from lead:', lead.notes)
  }
  notesSections.push('', '— Pricing not yet set. Use Generate Estimate, Claude Desktop, or edit line items manually.')

  // Carry the customer's size hint onto the job so the GenerateEstimateModal
  // shows it as a default. Vince still confirms in the modal — this just
  // saves the typing. Pricing isn't computed; only the sqft input is seeded.
  const hints = deriveQuoteHints(lead.project_type, lead.answers as Record<string, string> | null)

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      title,
      client_name: lead.client_name,
      client_phone: lead.client_phone,
      client_email: lead.client_email,
      customer_id: customerId,
      job_type: projectTypeLabel.split(' ')[0] ?? 'Tile',
      status: 'lead',
      scope_notes: notesSections.join('\n'),
      square_footage: hints.initialSqft,
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
    message:
      'Job created. Next: Generate Estimate (template), Claude Desktop (via MCP), or edit line items directly.',
  })
}
