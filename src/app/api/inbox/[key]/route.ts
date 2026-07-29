import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireApiAuth } from '@/lib/apiAuth'
import { sanitize } from '@/lib/validation'
import { sendSMS, toE164 } from '@/lib/openphone'
import { buildInbox, threadKeyForPhone } from '@/lib/inbox'
import { findCustomerByPhone } from '@/lib/phoneMatch'
import { bumpLastContactForCustomer, findSingleActiveJobId } from '@/lib/lastContact'

// Thread endpoints for the Inbox (pattern: api/jobs/[id]/messages).
//   GET  /api/inbox/[key] → full SMS+call timeline for a phone, marks it read
//   POST /api/inbox/[key] → reply by SMS, logged to message_log
//
// [key] is the thread key from /api/inbox: the phone's last-10 digits
// (short codes keep their raw digits). `qr:` website-only threads have no
// detail route — the UI links those to the lead workspace instead.

const KEY_RE = /^\d{5,15}$/

// Unread rows all come from the OpenPhone webhook, which always writes
// E.164 — so a LIKE on the digit suffix reliably finds everything that
// needs the read stamp. The JS threadKey filter below stays authoritative
// for what we *display*.
const likeFor = (key: string) => `%${key}`

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  try {
    const { key } = await params
    if (!KEY_RE.test(key)) {
      return NextResponse.json({ error: 'Invalid thread key' }, { status: 400 })
    }
    const supabase = createServiceClient()

    // Reuse the list read-model so contact/lead resolution is identical to
    // what the inbox list showed — no drift between row and thread header.
    const { threads } = await buildInbox(supabase)
    const thread = threads.find((t) => t.key === key) ?? null

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

    const items = [
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
    ].sort((a, b) => a.at.localeCompare(b.at))

    // Opening the thread IS reading it (mirror of jobs/[id]/messages GET).
    const now = new Date().toISOString()
    await Promise.all([
      supabase
        .from('message_log')
        .update({ read_at: now })
        .like('phone_number', likeFor(key))
        .eq('direction', 'inbound')
        .is('read_at', null),
      supabase
        .from('call_log')
        .update({ read_at: now })
        .like('phone_number', likeFor(key))
        .eq('direction', 'inbound')
        .is('read_at', null),
    ])
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
    const { key } = await params
    if (!KEY_RE.test(key)) {
      return NextResponse.json({ error: 'Invalid thread key' }, { status: 400 })
    }
    const body = await req.json().catch(() => ({}))
    const text = sanitize(typeof body.body === 'string' ? body.body : '')
    if (!text) {
      return NextResponse.json({ error: 'Message is empty' }, { status: 400 })
    }
    if (text.length > 1600) {
      return NextResponse.json({ error: 'Message too long (max 1600 chars)' }, { status: 400 })
    }

    const supabase = createServiceClient()

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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
