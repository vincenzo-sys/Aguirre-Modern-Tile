import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sanitize } from '@/lib/validation'
import { requireApiAuth } from '@/lib/apiAuth'
import { sendSMS, toE164 } from '@/lib/openphone'
import { sendCustomerEmail, ownerReplyTo } from '@/lib/email'

// Dashboard endpoints for the Aguirre side of the estimate conversation.
//   GET  /api/jobs/[id]/messages → fetch thread + stamp customer messages as read
//   POST /api/jobs/[id]/messages → Aguirre replies, customer gets SMS + email

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'http://localhost:3100'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  try {
    const { id: jobId } = await params
    const supabase = createServiceClient()

    const { data: messages, error } = await supabase
      .from('estimate_messages')
      .select('id, sender, sender_name, body, created_at, read_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Mark customer messages as read once Vince loads the thread on the
    // dashboard. Mirror of what the public GET does for Aguirre messages.
    await supabase
      .from('estimate_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('job_id', jobId)
      .eq('sender', 'customer')
      .is('read_at', null)

    return NextResponse.json({ messages: messages ?? [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  try {
    const { id: jobId } = await params
    const body = await req.json().catch(() => ({}))
    const messageBody = sanitize(typeof body.body === 'string' ? body.body : '')
    if (!messageBody) {
      return NextResponse.json({ error: 'Message is empty' }, { status: 400 })
    }
    if (messageBody.length > 4000) {
      return NextResponse.json({ error: 'Message too long (max 4000 chars)' }, { status: 400 })
    }
    const senderName = sanitize(typeof body.sender_name === 'string' ? body.sender_name : '') || 'Vince'

    const supabase = createServiceClient()
    const { data: job } = await supabase
      .from('jobs')
      .select('id, client_name, client_phone, client_email, estimate_token, title')
      .eq('id', jobId)
      .single()
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const { data: inserted, error } = await supabase
      .from('estimate_messages')
      .insert({
        job_id: job.id,
        sender: 'aguirre',
        sender_name: senderName,
        body: messageBody,
      })
      .select('id, sender, sender_name, body, created_at, read_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Notify customer — fire-and-forget. Don't block the dashboard reply on
    // a flaky SMS/email gateway.
    notifyCustomer(job, messageBody).catch((err) =>
      console.error('[messages] notify customer error:', err)
    )

    return NextResponse.json({ message: inserted })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function notifyCustomer(
  job: {
    client_name: string
    client_phone: string | null
    client_email: string | null
    estimate_token: string | null
  },
  messageBody: string
) {
  if (!job.estimate_token) return // No public link to send them to.
  const estimateLink = `${SITE_URL}/estimates/${job.estimate_token}#messages`
  const firstName = (job.client_name || '').split(' ')[0] || 'there'
  const preview = messageBody.length > 200 ? messageBody.slice(0, 200) + '…' : messageBody

  if (job.client_phone && process.env.OPENPHONE_API_KEY) {
    const e164 = toE164(job.client_phone)
    if (e164) {
      const sms =
        `Hi ${firstName}, Vince at Aguirre Modern Tile replied to your estimate question:\n\n${preview}\n\n${estimateLink}`
      await sendSMS(e164, sms).catch((err) =>
        console.error('[messages] sms to customer failed:', err)
      )
    }
  }

  if (job.client_email) {
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">
        <p style="font-size: 16px; margin: 0 0 12px 0;">Hi ${escapeHtml(firstName)},</p>
        <p style="font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">
          Vince at Aguirre Modern Tile replied to your question on your estimate.
        </p>
        <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 0 0 20px 0;">
          <p style="font-size: 15px; line-height: 1.5; margin: 0; white-space: pre-wrap;">${escapeHtml(messageBody)}</p>
        </div>
        <p style="font-size: 15px; line-height: 1.5; margin: 0 0 24px 0;">
          <a href="${estimateLink}" style="color: #0284c7; font-weight: 600;">View the full conversation on your estimate →</a>
        </p>
        <p style="font-size: 14px; color: #6b7280; line-height: 1.5; margin: 0;">
          Reply right on the estimate page, or text us at (617) 766-1259.
        </p>
        <p style="font-size: 12px; color: #6b7280; margin: 24px 0 0 0;">Aguirre Modern Tile · Greater Boston</p>
      </div>
    `.trim()

    await sendCustomerEmail({
      to: job.client_email,
      subject: 'Reply on your Aguirre Modern Tile estimate',
      html,
      replyTo: ownerReplyTo(),
    }).catch((err) => console.error('[messages] email to customer failed:', err))
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
