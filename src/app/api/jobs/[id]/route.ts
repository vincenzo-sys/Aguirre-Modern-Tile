import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, AUTO_MESSAGES } from '@/lib/openphone'
import { requireApiAuth } from '@/lib/apiAuth'

// Admin client — auth is already enforced upstream by requireApiAuth (which
// accepts either a session cookie or X-API-Key). Using the service-role client
// here lets API-key callers bypass RLS consistently, matching the pattern used
// by /api/customers/[id]. Previously this route used a cookie-bound client and
// silently returned 404 for API-key requests because RLS blocked the read.
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/jobs/[id] — Fetch a single job with customer data
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  const { id } = await params

  try {
    const supabase = getSupabase()

    const { data: job, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    return NextResponse.json(job)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PATCH /api/jobs/[id] — Update job fields (status, details, assignment, etc.)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  const { id } = await params

  try {
    const supabase = getSupabase()
    const body = await req.json()

    // Allowed fields that can be updated
    const allowedFields = [
      'title', 'status', 'client_name', 'client_phone', 'client_email', 'client_address',
      'customer_id', 'job_type', 'square_footage', 'scope_notes',
      'scheduled_start', 'scheduled_end', 'estimated_days', 'actual_days',
      'estimated_cost', 'actual_cost', 'amount_invoiced', 'amount_paid',
      'estimate_accepted_at',
      'line_items', 'assigned_to', 'notes', 'crew_instructions', 'crew_log', 'customer_provides',
    ]

    const updates: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Keep estimated_cost in sync with line_items so the customer-facing
    // estimate total (and Stripe deposit = 10% of it) always reflects the
    // latest edits. Caller can override by explicitly setting estimated_cost
    // in the same PATCH body.
    if ('line_items' in updates && !('estimated_cost' in updates)) {
      const items = Array.isArray(updates.line_items) ? updates.line_items : []
      const sum = items.reduce((s: number, it: { amount?: number }) => {
        return s + (Number(it?.amount) || 0)
      }, 0)
      updates.estimated_cost = Math.round(sum * 100) / 100
    }

    // Get the old status before updating
    const { data: oldJob } = await supabase
      .from('jobs')
      .select('status, client_phone, client_address, scheduled_start, customer_id')
      .eq('id', id)
      .single()

    const { data: job, error } = await supabase
      .from('jobs')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Auto-message on status change (non-blocking)
    if (updates.status && oldJob && updates.status !== oldJob.status && process.env.OPENPHONE_API_KEY) {
      const phone = (job as any).client_phone || oldJob.client_phone
      if (phone) {
        const newStatus = updates.status as string
        const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

        let message: string | null = null
        let triggerType: string | null = null

        if (newStatus === 'scheduled') {
          const date = (job as any).scheduled_start
          message = AUTO_MESSAGES.status_scheduled(date ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'soon')
          triggerType = 'status_scheduled'
        } else if (newStatus === 'in_progress') {
          message = AUTO_MESSAGES.status_in_progress((job as any).client_address || '')
          triggerType = 'status_in_progress'
        } else if (newStatus === 'completed') {
          message = AUTO_MESSAGES.status_completed
          triggerType = 'status_completed'
        }

        if (message && triggerType) {
          sendSMS(phone, message).then(async (result) => {
            await supabaseAdmin.from('message_log').insert({
              customer_id: (job as any).customer_id || oldJob.customer_id,
              job_id: id,
              phone_number: phone,
              direction: 'outbound',
              message,
              trigger_type: triggerType,
              openphone_message_id: result.messageId || null,
              status: result.success ? 'sent' : 'failed',
            })
          }).catch(console.error)
        }
      }
    }

    return NextResponse.json(job)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE /api/jobs/[id] — Remove a job.
// FKs are already set up to do the right thing:
//   - job_photos, invoices: CASCADE (deleted with the job)
//   - call_log, message_log: SET NULL (history preserved, just unlinked)
//   - quote_requests.converted_job_id: SET NULL (the lead becomes active again)
//
// Guard: if amount_paid > 0, require `force: true` in body to proceed.
// This prevents a routine-looking delete from destroying the record of a
// paid job by accident. The owner can still force it if they really want.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  const { id } = await params

  try {
    const supabase = getSupabase()

    const body = await req.json().catch(() => ({}))
    const force = Boolean((body as { force?: boolean }).force)

    const { data: job, error: fetchErr } = await supabase
      .from('jobs')
      .select('id, job_number, title, status, amount_paid, client_name, estimate_sent_at, estimate_viewed_at')
      .eq('id', id)
      .single()

    if (fetchErr || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Safety guards — each triggers a required force:true. The original
    // guard only caught paid jobs, but a delete is just as destructive for
    // a job with a live customer-facing estimate URL, whether or not
    // money's moved yet. Learned this the hard way on 2026-04-22.
    const amountPaid = Number(job.amount_paid ?? 0)
    const reasons: string[] = []
    if (amountPaid > 0) reasons.push(`amount_paid=$${amountPaid.toFixed(2)}`)
    if (job.estimate_sent_at) reasons.push(`estimate has been sent to the customer`)
    if (job.estimate_viewed_at) reasons.push(`customer has opened the estimate page`)

    if (reasons.length > 0 && !force) {
      return NextResponse.json(
        {
          error: `Job is not safe to delete silently: ${reasons.join('; ')}. Pass force:true to proceed.`,
          amount_paid: amountPaid,
          status: job.status,
          estimate_sent_at: job.estimate_sent_at,
          estimate_viewed_at: job.estimate_viewed_at,
        },
        { status: 409 }
      )
    }

    const { error: delErr } = await supabase.from('jobs').delete().eq('id', id)
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 })
    }

    console.log(
      `[Jobs] Deleted #${job.job_number} "${job.title}" (${id}) — status=${job.status} amount_paid=$${amountPaid} force=${force}`
    )

    return NextResponse.json({ deleted: true, job_number: job.job_number })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
