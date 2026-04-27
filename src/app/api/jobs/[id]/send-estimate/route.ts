import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/service'
import { requireApiAuth } from '@/lib/apiAuth'
import { sendSMS, toE164, AUTO_MESSAGES } from '@/lib/openphone'

// POST /api/jobs/[id]/send-estimate
//
// Single-button "send the customer their estimate" — fires both an SMS
// (via OpenPhone) and an email (via Resend) when we have those contact
// channels for the customer. Generates an estimate_token if the job
// doesn't have one yet, bumps estimate_sent_at, advances status from
// 'lead' → 'quoted', stamps last_contact_at, logs the message_log row.
//
// Body (optional): { sms?: boolean, email?: boolean } — defaults to
// sending both when contact channels are available. Pass {sms: false}
// or {email: false} to skip a channel.

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Aguirre Modern Tile <onboarding@resend.dev>'

function generateToken(): string {
  return randomBytes(18).toString('base64url')
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function buildEmailHtml(firstName: string, estimateUrl: string): string {
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hi there,'
  return `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
    <h2 style="color: #0369a1; margin: 0 0 16px;">Your tile estimate is ready</h2>
    <p>${greeting}</p>
    <p>Thanks for thinking of Aguirre Modern Tile for your project. Your estimate is ready to review.</p>
    <p style="margin: 24px 0;">
      <a href="${estimateUrl}" style="background: #0369a1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">View your estimate</a>
    </p>
    <p>You can review the breakdown and reserve your install date with the 10% deposit directly from that page (secured by Stripe). Any questions, just reply to this email or text us at (617) 766-1259.</p>
    <p style="color: #555;">Vincenzo Aguirre<br/>Aguirre Modern Tile</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;"/>
    <p style="font-size: 12px; color: #888;">
      The link stays the same forever — bookmark it if you want to share with a partner. We'll be notified the first time you open it.<br/>
      Aguirre Modern Tile · Greater Boston · aguirremoderntile.com
    </p>
  </body>
</html>`
}

interface SendBody {
  sms?: boolean
  email?: boolean
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  let body: SendBody = {}
  try {
    body = (await req.json()) as SendBody
  } catch {
    // empty body — both channels default to true
  }
  const wantSms = body.sms !== false
  const wantEmail = body.email !== false

  const { id } = await params
  const supabase = createServiceClient()

  // Pull job + customer in one round trip. Customer is the source of truth
  // for phone/email; job.client_* are denormalized fallbacks for jobs
  // created before the customer-record migration.
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select(
      'id, estimate_token, status, customer_id, client_name, client_phone, client_email'
    )
    .eq('id', id)
    .single()
  if (jobErr || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  let phone: string | null = job.client_phone ?? null
  let email: string | null = job.client_email ?? null
  let customerName: string | null = job.client_name ?? null
  if (job.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('name, phone, email')
      .eq('id', job.customer_id)
      .single()
    if (customer) {
      phone = customer.phone ?? phone
      email = customer.email ?? email
      customerName = customer.name ?? customerName
    }
  }

  // Generate the estimate token if missing — same logic as
  // /api/jobs/[id]/estimate-link, inlined here so the user can hit one
  // button instead of two.
  const updates: Record<string, unknown> = {
    estimate_sent_at: new Date().toISOString(),
    last_contact_at: new Date().toISOString(),
  }
  let token = job.estimate_token as string | null
  if (!token) {
    token = generateToken()
    updates.estimate_token = token
  }
  if (job.status === 'lead') {
    updates.status = 'quoted'
  }
  const { error: updateErr } = await supabase.from('jobs').update(updates).eq('id', id)
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || req.nextUrl.origin
  const estimateUrl = `${baseUrl}/estimates/${token}`
  const firstName = (customerName || '').trim().split(/\s+/)[0] ?? ''

  // ── SMS ──────────────────────────────────────────────────────────────
  let smsResult: { success: boolean; messageId?: string; error?: string } | null = null
  let smsPhone: string | null = null
  if (wantSms && phone) {
    smsPhone = toE164(phone)
    if (!smsPhone) {
      smsResult = { success: false, error: 'Phone could not be normalized to E.164' }
    } else {
      const message = AUTO_MESSAGES.estimate_ready(firstName, estimateUrl)
      smsResult = await sendSMS(smsPhone, message)
      if (smsResult.success) {
        await supabase.from('message_log').insert({
          customer_id: job.customer_id,
          job_id: job.id,
          phone_number: smsPhone,
          direction: 'outbound',
          message,
          trigger_type: 'estimate_ready',
          openphone_message_id: smsResult.messageId ?? null,
          status: 'sent',
        })
      }
    }
  } else if (wantSms && !phone) {
    smsResult = { success: false, error: 'No phone on file' }
  }

  // ── Email ────────────────────────────────────────────────────────────
  let emailResult: { success: boolean; id?: string; error?: string } | null = null
  if (wantEmail && email) {
    if (!process.env.RESEND_API_KEY) {
      emailResult = { success: false, error: 'RESEND_API_KEY not set' }
    } else {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY)
        const sent = await resend.emails.send({
          from: FROM_EMAIL,
          to: [email],
          subject: 'Your tile estimate from Aguirre Modern Tile',
          html: buildEmailHtml(firstName, estimateUrl),
        })
        if (sent.error) {
          emailResult = { success: false, error: sent.error.message }
        } else {
          emailResult = { success: true, id: sent.data?.id }
        }
      } catch (err) {
        emailResult = { success: false, error: err instanceof Error ? err.message : 'Email failed' }
      }
    }
  } else if (wantEmail && !email) {
    emailResult = { success: false, error: 'No email on file' }
  }

  return NextResponse.json({
    estimate_url: estimateUrl,
    new_status: job.status === 'lead' ? 'quoted' : job.status,
    sms: smsResult,
    email: emailResult,
  })
}
