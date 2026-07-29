import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, AUTO_MESSAGES } from '@/lib/openphone'
import { sendCustomerEmail, ownerReplyTo } from '@/lib/email'
import { requireApiAuth } from '@/lib/apiAuth'
import { recomputeJobFinancials } from '@/lib/jobPayments'

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
      // amount_paid is DERIVED (deposit_paid + final_payment_amount + paid
      // invoices) — never settable directly, or a later recompute would wipe
      // it. A manually recorded deposit writes the deposit_paid channel instead.
      'estimated_cost', 'actual_cost', 'amount_invoiced', 'deposit_paid',
      'estimate_accepted_at',
      'line_items', 'assigned_to', 'notes', 'crew_instructions', 'crew_log', 'customer_provides',
      'lost_reason',
      // Per-job editable estimate text snapshotted from estimate_defaults.
      'warranty_text', 'payment_terms_text', 'payment_methods',
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

    // If this PATCH touched a payment channel (a manually recorded deposit),
    // recompute amount_paid from all channels so it stays whole instead of
    // being set directly and later overwritten. See recomputeJobFinancials.
    let responseJob = job
    if ('deposit_paid' in updates) {
      await recomputeJobFinancials(supabase, id)
      const { data: refreshed } = await supabase.from('jobs').select('*').eq('id', id).single()
      if (refreshed) responseJob = refreshed
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

        // Job-completion close-out email — review request + final payment
        // info + thank-you, sent the moment status flips to completed. The
        // SMS template is generic; the email is the load-bearing close.
        if (newStatus === 'completed') {
          const clientEmail = (job as any).client_email
          if (clientEmail) {
            // Pull the customer's referral code so the close-out email can
            // invite them to refer a friend ($100 each).
            const custId = (job as any).customer_id || oldJob.customer_id
            let referralCode: string | null = null
            if (custId) {
              const { data: cust } = await supabaseAdmin
                .from('customers')
                .select('referral_code')
                .eq('id', custId)
                .single()
              referralCode = cust?.referral_code ?? null
            }
            sendCompletionEmail({
              email: clientEmail,
              firstName: ((job as any).client_name || '').split(' ')[0] || '',
              title: (job as any).title,
              estimatedCost: Number((job as any).estimated_cost ?? 0),
              amountPaid: Number((job as any).amount_paid ?? 0),
              estimateToken: (job as any).estimate_token,
              referralCode,
            }).catch((err) => console.error('completion email failed:', err))
          }
        }
      }
    }

    return NextResponse.json(responseJob)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function sendCompletionEmail({
  email,
  firstName,
  title,
  estimatedCost,
  amountPaid,
  estimateToken,
  referralCode,
}: {
  email: string
  firstName: string
  title: string
  estimatedCost: number
  amountPaid: number
  estimateToken: string | null
  referralCode?: string | null
}) {
  const balance = Math.max(0, estimatedCost - amountPaid)
  const balanceStr = balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,'
  const reviewUrl =
    process.env.GOOGLE_REVIEW_URL ||
    'https://www.google.com/maps/place/Aguirre+Modern+Tile'
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || ''
  const estimateUrl = estimateToken ? `${baseUrl}/estimates/${estimateToken}` : null
  const referralUrl = referralCode ? `${baseUrl}/refer/${referralCode}` : null

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">
      <p style="font-size: 16px; margin: 0 0 12px 0;">${greeting}</p>
      <p style="font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">
        <strong>${title}</strong> is complete. Thank you for trusting us with your home — we hope you love it.
      </p>

      ${
        balance > 0
          ? `<div style="background:#fefce8; border:1px solid #fde047; border-radius:8px; padding:16px 18px; margin: 0 0 20px 0;">
              <p style="font-size: 14px; color:#854d0e; font-weight:600; margin: 0 0 6px 0;">Final payment</p>
              <p style="font-size: 14px; color:#713f12; margin: 0 0 4px 0;">Balance due: <strong>$${balanceStr}</strong></p>
              <p style="font-size: 13px; color:#854d0e; margin: 0;">An invoice with payment options is on the way separately. You can also Zelle, Venmo, or send a check — just reply if you need details.</p>
            </div>`
          : `<div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:16px 18px; margin: 0 0 20px 0;">
              <p style="font-size: 14px; color:#15803d; font-weight:600; margin: 0;">Paid in full — thank you!</p>
            </div>`
      }

      <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:18px; margin: 0 0 20px 0; text-align: center;">
        <p style="font-size: 15px; color:#075985; margin: 0 0 12px 0;">Would you take 30 seconds to leave us a Google review?</p>
        <p style="font-size: 13px; color:#0c4a6e; margin: 0 0 14px 0;">Five-star reviews are the single biggest reason new customers choose us — it really makes a difference for a small team like ours.</p>
        <a href="${reviewUrl}" target="_blank" style="display:inline-block; padding:10px 20px; background:#0284c7; color:#fff; text-decoration:none; border-radius:6px; font-weight:600; font-size:14px;">Leave a Google review →</a>
      </div>

      ${
        referralUrl
          ? `<div style="background:#f5f3ff; border:1px solid #ddd6fe; border-radius:8px; padding:18px; margin: 0 0 20px 0; text-align:center;">
              <p style="font-size: 15px; color:#5b21b6; font-weight:600; margin: 0 0 6px 0;">Know someone who needs tile work?</p>
              <p style="font-size: 13px; color:#6d28d9; margin: 0 0 14px 0;">Refer a friend and <strong>you both get $100</strong> toward your projects when they book. Share your link:</p>
              <a href="${referralUrl}" target="_blank" style="display:inline-block; padding:10px 20px; background:#7c3aed; color:#fff; text-decoration:none; border-radius:6px; font-weight:600; font-size:14px;">Refer a friend →</a>
              <p style="font-size: 12px; color:#7c3aed; margin: 12px 0 0 0; word-break: break-all;">${referralUrl}</p>
            </div>`
          : ''
      }

      <p style="font-size: 14px; line-height: 1.5; margin: 0 0 16px 0; color:#374151;">
        A couple of care tips for the first 72 hours: avoid heavy water on the grout while it cures, and don't move furniture across the floor. Beyond that, the tile is yours — enjoy it.
      </p>
      ${
        estimateUrl
          ? `<p style="font-size: 13px; color:#6b7280; margin: 0 0 16px 0;">Original estimate: <a href="${estimateUrl}" style="color:#0284c7;">${estimateUrl}</a></p>`
          : ''
      }
      <p style="font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">
        Anything come up — a chip, a question, a stain you're not sure about — just reply or text me at
        <a href="tel:+16177661259" style="color:#0284c7;">(617) 766-1259</a>.
      </p>
      <p style="font-size: 16px; margin: 24px 0 4px 0;">— Vince</p>
      <p style="font-size: 13px; color: #6b7280; margin: 0;">Aguirre Modern Tile · Greater Boston</p>
    </div>
  `.trim()

  await sendCustomerEmail({
    to: email,
    subject: `${title} — all done. Thanks!`,
    html,
    replyTo: ownerReplyTo(),
  })
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
