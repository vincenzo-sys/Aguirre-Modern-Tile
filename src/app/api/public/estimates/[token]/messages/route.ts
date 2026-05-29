import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sanitize, rateLimit } from '@/lib/validation'
import { sendSMS, toE164 } from '@/lib/openphone'
import { sendCustomerEmail } from '@/lib/email'

// Public endpoints for the customer-side conversation thread.
//   GET  /api/public/estimates/[token]/messages → return thread
//   POST /api/public/estimates/[token]/messages → customer posts a question
//
// Auth model: possession of the estimate token = right to read + post.
// Same as how /api/public/estimates/[token] works for estimate viewing.
// Token is opaque + per-job, so a customer can only see their own thread.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'http://localhost:3100'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const supabase = createServiceClient()

    const { data: job } = await supabase
      .from('jobs')
      .select('id')
      .eq('estimate_token', token)
      .single()
    if (!job) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })

    const { data: messages, error } = await supabase
      .from('estimate_messages')
      .select('id, sender, sender_name, body, created_at')
      .eq('job_id', job.id)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Stamp Aguirre messages as "read by customer" once the customer GETs
    // the thread. That way the dashboard can show "customer saw your reply".
    await supabase
      .from('estimate_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('job_id', job.id)
      .eq('sender', 'aguirre')
      .is('read_at', null)

    return NextResponse.json({ messages: messages ?? [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Same rate limit as /api/contact: 5 posts/min/IP. A customer asking
    // back-to-back questions hits this comfortably; a script slamming the
    // endpoint hits the wall.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const limit = rateLimit(`msg:${ip}`, { maxRequests: 5, windowMs: 60_000 })
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many messages. Wait a moment and try again.' },
        { status: 429 }
      )
    }

    const { token } = await params
    const body = await req.json().catch(() => ({}))
    const messageBody = sanitize(typeof body.body === 'string' ? body.body : '')
    if (!messageBody || messageBody.length < 1) {
      return NextResponse.json({ error: 'Message is empty' }, { status: 400 })
    }
    if (messageBody.length > 4000) {
      return NextResponse.json({ error: 'Message too long (max 4000 chars)' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: job } = await supabase
      .from('jobs')
      .select('id, client_name, client_phone, client_email, title, estimate_token')
      .eq('estimate_token', token)
      .single()
    if (!job) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })

    const senderName = job.client_name || 'Customer'

    const { data: inserted, error } = await supabase
      .from('estimate_messages')
      .insert({
        job_id: job.id,
        sender: 'customer',
        sender_name: senderName,
        body: messageBody,
      })
      .select('id, sender, sender_name, body, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Notify Vince — fire-and-forget so a flaky OpenPhone/Resend doesn't
    // make the customer think their message failed to send.
    notifyVince(job, messageBody, senderName).catch((err) =>
      console.error('[messages] notify error:', err)
    )

    return NextResponse.json({ message: inserted })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function notifyVince(
  job: { id: string; client_name: string; title: string | null },
  messageBody: string,
  senderName: string
) {
  const dashboardLink = `${SITE_URL}/dashboard/jobs/${job.id}#messages`
  const preview = messageBody.length > 240 ? messageBody.slice(0, 240) + '…' : messageBody

  const ownerPhone = process.env.OWNER_PHONE
  if (ownerPhone && process.env.OPENPHONE_API_KEY) {
    const e164 = toE164(ownerPhone)
    if (e164) {
      const sms =
        `New estimate question from ${senderName}` +
        (job.title ? ` (${job.title})` : '') +
        `:\n\n${preview}\n\nReply: ${dashboardLink}`
      await sendSMS(e164, sms).catch((err) =>
        console.error('[messages] sms to owner failed:', err)
      )
    }
  }

  const ownerEmail = process.env.CONTACT_FORM_TO_EMAIL || 'vin@moderntile.pro'
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">
      <p style="font-size: 13px; color: #6b7280; margin: 0 0 8px 0;">Estimate question</p>
      <h2 style="font-size: 18px; margin: 0 0 16px 0;">${senderName}${job.title ? ` — ${escapeHtml(job.title)}` : ''}</h2>
      <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 0 0 20px 0;">
        <p style="font-size: 15px; line-height: 1.5; margin: 0; white-space: pre-wrap;">${escapeHtml(messageBody)}</p>
      </div>
      <p style="font-size: 14px; line-height: 1.5; margin: 0 0 16px 0;">
        <a href="${dashboardLink}" style="color: #0284c7; font-weight: 600;">Reply in the dashboard →</a>
      </p>
      <p style="font-size: 12px; color: #6b7280; margin: 24px 0 0 0;">Aguirre Modern Tile · estimate messaging</p>
    </div>
  `.trim()

  await sendCustomerEmail({
    to: ownerEmail,
    subject: `New estimate question from ${senderName}`,
    html,
  }).catch((err) => console.error('[messages] email to owner failed:', err))
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
