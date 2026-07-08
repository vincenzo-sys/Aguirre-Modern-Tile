import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, AUTO_MESSAGES, toE164 } from '@/lib/openphone'
import { requireApiAuth } from '@/lib/apiAuth'

// POST /api/jobs/[id]/request-crew-approval
//
// Vince clicks "Get Christian's approval" on a job. We:
//   1. Look up the approver's phone — CREW_APPROVER_PHONE env var first,
//      falling back to the first active crew profile.
//   2. Send SMS with a one-line summary + a link to the dashboard job
//      detail. Christian taps it, lands authenticated (or hits login),
//      and uses the in-page Approve / Needs Changes buttons.
//   3. Stamp crew_approval_status='pending' + requested_at on the job.
//   4. Log to message_log so the SMS shows up in the per-job thread.
//
// Re-requests overwrite — if Christian rejected last week and Vince
// revised the estimate, clicking the button again sets pending and
// fires a fresh SMS. Audit trail lives in message_log.

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function resolveApproverPhone(supabase: ReturnType<typeof getSupabase>): Promise<string | null> {
  const fromEnv = process.env.CREW_APPROVER_PHONE
  if (fromEnv) return toE164(fromEnv)

  // Fallback: first active crew profile with a phone on file.
  const { data } = await supabase
    .from('profiles')
    .select('phone, full_name')
    .eq('role', 'crew')
    .eq('is_active', true)
    .not('phone', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1)
  const phone = data?.[0]?.phone
  return phone ? toE164(phone) : null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  const { id } = await params
  const supabase = getSupabase()

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, title, customer_id, estimated_cost, estimated_days')
    .eq('id', id)
    .single()
  if (jobErr || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const phone = await resolveApproverPhone(supabase)
  if (!phone) {
    return NextResponse.json(
      {
        error:
          'No approver phone configured. Set CREW_APPROVER_PHONE env var or add a crew profile with a phone number.',
      },
      { status: 400 }
    )
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || ''
  const dashUrl = `${baseUrl}/dashboard/leads/${job.id}`
  const total = Math.round(Number(job.estimated_cost ?? 0)).toLocaleString()
  const days = String(Math.round(Number(job.estimated_days ?? 0) * 10) / 10)
  const body = AUTO_MESSAGES.crew_approval_request(job.title, total, days, dashUrl)

  const smsResult = await sendSMS(phone, body)

  await supabase
    .from('jobs')
    .update({
      crew_approval_status: 'pending',
      crew_approval_requested_at: new Date().toISOString(),
      // Clear stale notes from a previous rejection so the dashboard
      // doesn't keep showing them next to a fresh pending request.
      crew_approval_notes: null,
      crew_approved_at: null,
      crew_approved_by: null,
    })
    .eq('id', id)

  await supabase.from('message_log').insert({
    customer_id: job.customer_id,
    job_id: id,
    phone_number: phone,
    direction: 'outbound',
    message: body,
    trigger_type: 'crew_approval_request',
    openphone_message_id: smsResult.messageId || null,
    status: smsResult.success ? 'sent' : 'failed',
  })

  if (!smsResult.success) {
    return NextResponse.json(
      { success: false, error: smsResult.error || 'SMS failed' },
      { status: 502 }
    )
  }

  return NextResponse.json({ success: true, sent_to: phone })
}
