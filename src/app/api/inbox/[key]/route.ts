import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireApiAuth } from '@/lib/apiAuth'
import { sanitize } from '@/lib/validation'
import { sendSMS, toE164 } from '@/lib/openphone'
import { sendCustomerEmail, ownerReplyTo } from '@/lib/email'
import { buildInbox, threadKeyForPhone, type InboxThread } from '@/lib/inbox'
import { findCustomerByPhone } from '@/lib/phoneMatch'
import { bumpLastContactForCustomer, findSingleActiveJobId } from '@/lib/lastContact'

// Thread endpoints for the Inbox (pattern: api/jobs/[id]/messages).
//   GET  /api/inbox/[key] → full timeline for one contact, marks it read
//   POST /api/inbox/[key] → reply (SMS for phone threads, email for em: threads)
//
// [key] is the thread key from /api/inbox: a phone's last-10 digits (short
// codes keep their raw digits), or `em:<address>` for email-only contacts.
// `qr:` website-only threads have no detail route — the UI links those to
// the lead workspace instead.

const PHONE_KEY_RE = /^\d{5,15}$/
const EM_KEY_RE = /^em:[^\s@]+@[^\s@]+\.[^\s@]+$/

// Unread SMS/call rows all come from the OpenPhone webhook, which always
// writes E.164 — so a LIKE on the digit suffix reliably finds everything
// that needs the read stamp. The JS threadKey filter stays authoritative
// for what we *display*.
const likeFor = (key: string) => `%${key}`

const EMAIL_SELECT =
  'id, customer_id, direction, from_email, to_email, subject, body_text, body_html, read_at, created_at'

type EmailRow = {
  id: string
  customer_id: string | null
  direction: string
  from_email: string
  to_email: string | null
  subject: string | null
  body_text: string | null
  body_html: string | null
  read_at: string | null
  created_at: string
}

function resolveKey(raw: string): { kind: 'phone' | 'email'; key: string } | null {
  const key = decodeURIComponent(raw)
  if (PHONE_KEY_RE.test(key)) return { kind: 'phone', key }
  if (EM_KEY_RE.test(key)) return { kind: 'email', key }
  return null
}

// Every email involving this contact: by linked customer and/or by the
// counterpart address. Addresses are stored lowercased, so .eq matching is
// exact (no PostgREST reserved-char worries, unlike .or/.ilike).
async function fetchEmailRows(
  supabase: ReturnType<typeof createServiceClient>,
  { customerId, address }: { customerId: string | null; address: string | null }
): Promise<EmailRow[]> {
  const queries = []
  if (customerId) {
    queries.push(supabase.from('email_log').select(EMAIL_SELECT).eq('customer_id', customerId).limit(200))
  }
  if (address) {
    queries.push(supabase.from('email_log').select(EMAIL_SELECT).eq('from_email', address).limit(200))
    queries.push(supabase.from('email_log').select(EMAIL_SELECT).eq('to_email', address).limit(200))
  }
  if (queries.length === 0) return []
  const results = await Promise.all(queries)
  const byId = new Map<string, EmailRow>()
  for (const r of results) {
    for (const row of (r.data ?? []) as EmailRow[]) byId.set(row.id, row)
  }
  return [...byId.values()]
}

async function markEmailsRead(
  supabase: ReturnType<typeof createServiceClient>,
  { customerId, address }: { customerId: string | null; address: string | null },
  now: string
) {
  const updates = []
  if (customerId) {
    updates.push(
      supabase.from('email_log').update({ read_at: now }).eq('customer_id', customerId)
        .eq('direction', 'inbound').is('read_at', null)
    )
  }
  if (address) {
    updates.push(
      supabase.from('email_log').update({ read_at: now }).eq('from_email', address)
        .eq('direction', 'inbound').is('read_at', null)
    )
  }
  await Promise.all(updates)
}

function emailItem(row: EmailRow) {
  const body =
    row.body_text ??
    (row.body_html ? row.body_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null)
  return {
    type: 'email' as const,
    id: row.id,
    direction: row.direction === 'outbound' ? ('outbound' as const) : ('inbound' as const),
    subject: row.subject,
    body,
    at: row.created_at,
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  try {
    const { key: rawKey } = await params
    const resolved = resolveKey(rawKey)
    if (!resolved) {
      return NextResponse.json({ error: 'Invalid thread key' }, { status: 400 })
    }
    const { kind, key } = resolved
    const supabase = createServiceClient()

    // Reuse the list read-model so contact/lead resolution is identical to
    // what the inbox list showed — no drift between row and thread header.
    const { threads } = await buildInbox(supabase)
    const thread: InboxThread | null = threads.find((t) => t.key === key) ?? null

    const address = kind === 'email' ? key.slice(3) : (thread?.email ?? null)
    const customerId = thread?.customer_id ?? null

    let items: Array<Record<string, unknown>> = []

    if (kind === 'phone') {
      const [messagesRes, callsRes] = await Promise.all([
        supabase
          .from('message_log')
          .select('id, customer_id, job_id, phone_number, direction, message, trigger_type, status, read_at, created_at')
          .like('phone_number', likeFor(key))
          .order('created_at', { ascending: true })
          .limit(500),
        supabase
          .from('call_log')
          .select('id, customer_id, phone_number, direction, status, duration, recording_url, transcript, read_at, created_at')
          .like('phone_number', likeFor(key))
          .order('created_at', { ascending: true })
          .limit(200),
      ])
      if (messagesRes.error) {
        return NextResponse.json({ error: messagesRes.error.message }, { status: 500 })
      }
      if (callsRes.error) {
        return NextResponse.json({ error: callsRes.error.message }, { status: 500 })
      }
      items = [
        ...(messagesRes.data ?? [])
          .filter((m) => threadKeyForPhone(m.phone_number) === key)
          .map((m) => ({
            type: 'sms' as const,
            id: m.id,
            direction: m.direction === 'outbound' ? ('outbound' as const) : ('inbound' as const),
            body: m.message,
            trigger_type: m.trigger_type,
            status: m.status,
            at: m.created_at,
          })),
        ...(callsRes.data ?? [])
          .filter((c) => threadKeyForPhone(c.phone_number) === key)
          .map((c) => ({
            type: 'call' as const,
            id: c.id,
            direction: c.direction === 'outbound' ? ('outbound' as const) : ('inbound' as const),
            status: c.status,
            duration: c.duration,
            recording_url: c.recording_url,
            transcript: c.transcript,
            at: c.created_at,
          })),
      ]
    }

    // Emails join the timeline on BOTH kinds of thread — a customer with a
    // phone still has their emails shown in the one conversation.
    const emailRows = await fetchEmailRows(supabase, { customerId, address })
    items = [...items, ...emailRows.map(emailItem)].sort((a, b) =>
      String(a.at).localeCompare(String(b.at))
    )

    // Opening the thread IS reading it (mirror of jobs/[id]/messages GET).
    const now = new Date().toISOString()
    const readUpdates: PromiseLike<unknown>[] = [
      markEmailsRead(supabase, { customerId, address }, now),
    ]
    if (kind === 'phone') {
      readUpdates.push(
        supabase.from('message_log').update({ read_at: now })
          .like('phone_number', likeFor(key)).eq('direction', 'inbound').is('read_at', null),
        supabase.from('call_log').update({ read_at: now })
          .like('phone_number', likeFor(key)).eq('direction', 'inbound').is('read_at', null)
      )
    }
    await Promise.all(readUpdates)

    // A merged website lead is "seen" too: new → reviewed (a status the
    // pipeline already treats identically to new, so the Leads board is
    // unaffected).
    if (thread?.lead?.kind === 'quote_request') {
      await supabase
        .from('quote_requests')
        .update({ status: 'reviewed' })
        .eq('id', thread.lead.id)
        .eq('status', 'new')
    }

    return NextResponse.json({ contact: thread, items })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  try {
    const { key: rawKey } = await params
    const resolved = resolveKey(rawKey)
    if (!resolved) {
      return NextResponse.json({ error: 'Invalid thread key' }, { status: 400 })
    }
    const { kind, key } = resolved
    const body = await req.json().catch(() => ({}))
    const maxLen = kind === 'email' ? 4000 : 1600
    const text = sanitize(typeof body.body === 'string' ? body.body : '')
    if (!text) {
      return NextResponse.json({ error: 'Message is empty' }, { status: 400 })
    }
    if (text.length > maxLen) {
      return NextResponse.json({ error: `Message too long (max ${maxLen} chars)` }, { status: 400 })
    }

    const supabase = createServiceClient()
    return kind === 'email'
      ? replyByEmail(supabase, key.slice(3), text)
      : replyBySms(supabase, key, text)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function replyBySms(
  supabase: ReturnType<typeof createServiceClient>,
  key: string,
  text: string
) {
  // Send to the exact number this thread has been using (E.164 from
  // OpenPhone) rather than reconstructing one from the key.
  const [msgRecent, callRecent] = await Promise.all([
    supabase
      .from('message_log')
      .select('phone_number, customer_id')
      .like('phone_number', likeFor(key))
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('call_log')
      .select('phone_number, customer_id')
      .like('phone_number', likeFor(key))
      .order('created_at', { ascending: false })
      .limit(1),
  ])
  const source = msgRecent.data?.[0] ?? callRecent.data?.[0] ?? null
  const dest = toE164(source?.phone_number ?? key)
  if (!dest) {
    return NextResponse.json({ error: 'No valid phone number for this thread' }, { status: 400 })
  }

  let customerId = source?.customer_id ?? null
  if (!customerId) {
    const customer = await findCustomerByPhone(supabase, dest)
    customerId = customer?.id ?? null
  }
  const jobId = customerId ? await findSingleActiveJobId(supabase, customerId) : null

  const sms = await sendSMS(dest, text)
  if (!sms.success) {
    return NextResponse.json({ error: sms.error || 'SMS send failed' }, { status: 502 })
  }

  const { data: inserted, error } = await supabase
    .from('message_log')
    .insert({
      customer_id: customerId,
      job_id: jobId,
      phone_number: dest,
      direction: 'outbound',
      message: text,
      trigger_type: 'inbox_reply',
      openphone_message_id: sms.messageId || null,
      status: 'sent',
    })
    .select('id, customer_id, job_id, phone_number, direction, message, trigger_type, status, read_at, created_at')
    .single()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Replying is contact: reset staleness for the nurture cron.
  if (customerId) {
    await bumpLastContactForCustomer(supabase, customerId)
  }

  return NextResponse.json({ message: inserted })
}

async function replyByEmail(
  supabase: ReturnType<typeof createServiceClient>,
  address: string,
  text: string
) {
  const fromAddress = ownerReplyTo()

  // Continue the subject line of the latest email in the thread.
  const { data: latest } = await supabase
    .from('email_log')
    .select('subject, customer_id')
    .eq('from_email', address)
    .order('created_at', { ascending: false })
    .limit(1)
  const lastSubject = latest?.[0]?.subject ?? null
  const subject = lastSubject
    ? /^re:/i.test(lastSubject)
      ? lastSubject
      : `Re: ${lastSubject}`
    : 'From Aguirre Modern Tile'

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">
      <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px 0; white-space: pre-wrap;">${escapeHtml(text)}</p>
      <p style="font-size: 15px; margin: 24px 0 4px 0;">— Vince</p>
      <p style="font-size: 13px; color: #6b7280; margin: 0;">Aguirre Modern Tile · Greater Boston · (617) 766-1259</p>
    </div>
  `.trim()

  const sent = await sendCustomerEmail({ to: address, subject, html, replyTo: fromAddress })
  if (!sent.success) {
    return NextResponse.json({ error: sent.error || 'Email send failed' }, { status: 502 })
  }

  let customerId = latest?.[0]?.customer_id ?? null
  if (!customerId) {
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .ilike('email', address)
      .limit(1)
      .maybeSingle()
    customerId = customer?.id ?? null
  }

  const { data: inserted, error } = await supabase
    .from('email_log')
    .insert({
      customer_id: customerId,
      direction: 'outbound',
      from_email: fromAddress.toLowerCase(),
      to_email: address,
      subject,
      body_text: text,
    })
    .select(EMAIL_SELECT)
    .single()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (customerId) {
    await bumpLastContactForCustomer(supabase, customerId)
  }

  return NextResponse.json({ message: inserted })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
