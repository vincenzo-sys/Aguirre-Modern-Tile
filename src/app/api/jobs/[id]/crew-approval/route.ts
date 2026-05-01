import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { sendSMS, AUTO_MESSAGES, toE164 } from '@/lib/openphone'

// POST /api/jobs/[id]/crew-approval
//
// Christian (or any authenticated dashboard user) records their decision.
// Body: { status: 'approved' | 'rejected', notes?: string }
//
// On success:
//   - Updates the job with status, notes, approved_at, approved_by (auth.user.id)
//   - Sends SMS to OWNER_PHONE with the result so Vince knows immediately
//   - Logs the outbound SMS to message_log
//
// Auth: requires a Supabase session — we want approved_by to be a real
// profile id, so an X-API-Key bypass would defeat the audit trail. The
// dashboard cookie path is the only legit caller.

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Cookie-based auth only — we need the user's profile id for crew_approved_by.
  const sessionClient = await createServerClient()
  const {
    data: { user },
  } = await sessionClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const status = body.status as 'approved' | 'rejected' | undefined
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 1000).trim() : ''

  if (status !== 'approved' && status !== 'rejected') {
    return NextResponse.json({ error: 'status must be approved or rejected' }, { status: 400 })
  }

  const supabase = getServiceClient()

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, title, customer_id, crew_approval_status')
    .eq('id', id)
    .single()
  if (jobErr || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  await supabase
    .from('jobs')
    .update({
      crew_approval_status: status,
      crew_approval_notes: notes || null,
      crew_approved_at: new Date().toISOString(),
      crew_approved_by: user.id,
    })
    .eq('id', id)

  // Notify Vince. OWNER_PHONE may be missing on local dev — non-fatal.
  if (process.env.OWNER_PHONE && process.env.OPENPHONE_API_KEY) {
    const ownerE164 = toE164(process.env.OWNER_PHONE)
    if (ownerE164) {
      const smsBody = AUTO_MESSAGES.crew_approval_result(
        job.title,
        status === 'approved',
        notes
      )
      const smsResult = await sendSMS(ownerE164, smsBody)
      await supabase.from('message_log').insert({
        customer_id: job.customer_id,
        job_id: id,
        phone_number: ownerE164,
        direction: 'outbound',
        message: smsBody,
        trigger_type: 'crew_approval_result',
        openphone_message_id: smsResult.messageId || null,
        status: smsResult.success ? 'sent' : 'failed',
      })
    }
  }

  return NextResponse.json({ success: true, status })
}
