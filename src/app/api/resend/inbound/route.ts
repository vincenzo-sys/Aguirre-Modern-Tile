import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  verifySvixSignature,
  parseEmailReceivedEvent,
  extractEmailAddress,
} from '@/lib/resendWebhook'
import { sendCustomerEmail } from '@/lib/email'
import { bumpLastContactForCustomer, findSingleActiveJobId } from '@/lib/lastContact'

// POST /api/resend/inbound — Resend "email.received" webhook.
//
// Flow: verify svix signature (fail closed — this writes CRM rows and
// triggers a forward, so an unsigned request must never be processed) →
// fetch the full message body from the Receiving API (the webhook itself
// carries metadata only) → insert email_log (unique resend_email_id makes
// redelivery a no-op) → link customer by address → bump last-contact →
// forward a copy to the owner's Gmail so nothing changes about where email
// can be read.

export const maxDuration = 30

const OWNER_EMAIL = process.env.CONTACT_FORM_TO_EMAIL || 'vin@moderntile.pro'

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()

    const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET
    if (!secret) {
      console.error('RESEND_INBOUND_WEBHOOK_SECRET not set — rejecting inbound email webhook')
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
    }
    const ok = verifySvixSignature(
      rawBody,
      {
        id: req.headers.get('svix-id'),
        timestamp: req.headers.get('svix-timestamp'),
        signature: req.headers.get('svix-signature'),
      },
      secret
    )
    if (!ok) {
      console.warn('Resend inbound webhook: signature verification failed — rejecting')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event = parseEmailReceivedEvent(JSON.parse(rawBody))
    if (!event) {
      // Some other event type subscribed by mistake — acknowledge and drop.
      return NextResponse.json({ received: true })
    }

    // The webhook has no body — pull the full message. If this fails we
    // still log the metadata row: an inbox entry with no body beats an
    // invisible email.
    const full = await fetchReceivedEmail(event.emailId)

    const fromEmail = full?.from ?? event.from
    if (!fromEmail) {
      console.warn(`Resend inbound: no from address on ${event.emailId}`)
      return NextResponse.json({ received: true })
    }

    const supabase = createServiceClient()

    // Link to a customer by address (email is unique enough; web intake
    // already dedups customers on it).
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .ilike('email', fromEmail)
      .limit(1)
      .maybeSingle()
    const customerId = customer?.id ?? null
    const jobId = customerId ? await findSingleActiveJobId(supabase, customerId) : null

    const { error } = await supabase.from('email_log').insert({
      customer_id: customerId,
      job_id: jobId,
      direction: 'inbound',
      from_email: fromEmail,
      to_email: full?.to ?? event.to,
      subject: full?.subject ?? event.subject,
      body_text: full?.text ?? null,
      body_html: full?.html ?? null,
      resend_email_id: event.emailId,
      message_id: full?.messageId ?? event.messageId,
    })
    if (error) {
      // 23505 = redelivered webhook for an email we already stored.
      if (error.code === '23505') return NextResponse.json({ received: true, duplicate: true })
      console.error('Resend inbound: email_log insert failed:', error.message)
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
    }

    // An email from the customer is contact — stop stale-lead nudges.
    if (customerId) {
      await bumpLastContactForCustomer(supabase, customerId)
    }

    // Copy to the owner's real mailbox (reply-to = the customer, so replying
    // from Gmail still works). Fire-and-forget; skip self-mail.
    if (fromEmail !== OWNER_EMAIL.toLowerCase()) {
      const html =
        full?.html ??
        `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(full?.text ?? '(no body)')}</pre>`
      sendCustomerEmail({
        to: OWNER_EMAIL,
        subject: full?.subject ?? event.subject ?? '(no subject)',
        html,
        replyTo: fromEmail,
      }).catch((err) => console.error('Resend inbound: forward to owner failed:', err))
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('Resend inbound webhook error:', err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}

type ReceivedEmail = {
  from: string | null
  to: string | null
  subject: string | null
  text: string | null
  html: string | null
  messageId: string | null
}

async function fetchReceivedEmail(id: string): Promise<ReceivedEmail | null> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) {
      console.error(`Resend receiving fetch ${id}: HTTP ${res.status}`)
      return null
    }
    const data = await res.json()
    const firstTo = Array.isArray(data.to) ? data.to[0] : data.to
    return {
      from: extractEmailAddress(data.from),
      to: extractEmailAddress(firstTo),
      subject: typeof data.subject === 'string' ? data.subject : null,
      text: typeof data.text === 'string' ? data.text : null,
      html: typeof data.html === 'string' ? data.html : null,
      messageId: typeof data.message_id === 'string' ? data.message_id : null,
    }
  } catch (err) {
    console.error(`Resend receiving fetch ${id} failed:`, err)
    return null
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
