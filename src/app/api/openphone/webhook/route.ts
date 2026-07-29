import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, AUTO_MESSAGES } from '@/lib/openphone'
import { fetchOpenPhoneTranscript } from '@/lib/openphoneTranscripts'
import { verifyOpenPhoneSignature } from '@/lib/openphoneSignature'
import { findCustomerByPhone } from '@/lib/phoneMatch'
import {
  parseCallEvent,
  parseMessageEvent,
  shouldSendMissedCallText,
  initialCallReadAt,
} from '@/lib/openphoneEvents'
import { bumpLastContactForCustomer, findSingleActiveJobId } from '@/lib/lastContact'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const maxDuration = 30

// POST /api/openphone/webhook — Receives events from OpenPhone
export async function POST(req: NextRequest) {
  try {
    // Read the RAW body first so the signature check sees the exact bytes.
    const rawBody = await req.text()

    // This endpoint drives paid SMS sends and service-role CRM writes, so an
    // unauthenticated POST is abusable (forged missed-call events → auto-texts
    // to arbitrary numbers). Verify the signature when a signing secret is
    // configured. Gated on OPENPHONE_WEBHOOK_SECRET for a safe rollout: once
    // the secret is set, forged/unsigned events are rejected; until then we log
    // loudly and continue so real events aren't dropped before the secret ships.
    const secret = process.env.OPENPHONE_WEBHOOK_SECRET
    if (secret) {
      const ok = verifyOpenPhoneSignature(
        rawBody,
        req.headers.get('openphone-signature'),
        secret
      )
      if (!ok) {
        console.warn('OpenPhone webhook: signature verification failed — rejecting')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    } else {
      console.warn(
        'OPENPHONE_WEBHOOK_SECRET not set — webhook is UNAUTHENTICATED. Set it to enable signature verification.'
      )
    }

    const body = JSON.parse(rawBody)
    const eventType = body.type || body.event

    console.log('OpenPhone webhook:', eventType, JSON.stringify(body).slice(0, 500))

    switch (eventType) {
      case 'call.completed':
        await handleCall(body)
        break
      case 'call.ringing':
        // Deliberately ignored. Running the call handler on ring used to
        // read duration 0 as "missed" and fire the sorry-we-missed-you
        // auto-text while the phone was still ringing, then log a duplicate
        // call_log row when call.completed arrived seconds later.
        break
      case 'call.transcript.completed':
      case 'call.recording.completed':
        // OpenPhone fires call.transcript.completed when the AI transcript
        // finishes processing (typically a few seconds to a few minutes
        // after the call ends). We also catch call.recording.completed in
        // case the transcript event isn't enabled — the transcript API
        // works off the same callId either way.
        await handleTranscriptReady(body)
        break
      case 'message.received':
        await handleIncomingMessage(body)
        break
      default:
        console.log('Unhandled OpenPhone event:', eventType)
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('OpenPhone webhook error:', err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}

async function handleCall(body: any) {
  const supabase = getSupabaseAdmin()
  const ev = parseCallEvent(body)
  if (!ev) {
    console.warn('OpenPhone webhook: no phone number found')
    return
  }

  // Link by last-10 digits — OpenPhone sends E.164 while web intake stores
  // whatever the customer typed, so exact equality misses real matches.
  // No auto-create: unknown callers surface in the Inbox with a one-tap
  // "New lead" instead of forking a customer record named after the number.
  const customer = await findCustomerByPhone(supabase, ev.phoneNumber)
  const customerId = customer?.id ?? null

  // Upsert by call id: OpenPhone redelivers webhooks, and the auto-text
  // below must only fire for a call we haven't seen before.
  let isNewRow = true
  if (ev.openphoneCallId) {
    const { data: existing } = await supabase
      .from('call_log')
      .select('id')
      .eq('openphone_call_id', ev.openphoneCallId)
      .maybeSingle()
    if (existing) {
      isNewRow = false
      const patch: Record<string, unknown> = {
        direction: ev.direction,
        status: ev.status,
        duration: ev.duration,
        recording_url: ev.recordingUrl,
      }
      // Never null-out an existing customer link on redelivery.
      if (customerId) patch.customer_id = customerId
      await supabase.from('call_log').update(patch).eq('id', existing.id)
    }
  }

  if (isNewRow) {
    await supabase.from('call_log').insert({
      customer_id: customerId,
      phone_number: ev.phoneNumber,
      direction: ev.direction,
      status: ev.status,
      duration: ev.duration,
      recording_url: ev.recordingUrl,
      openphone_call_id: ev.openphoneCallId,
      // Inbox read-state: only an unanswered inbound call is "waiting on
      // you" — answered and outbound calls are born read.
      read_at: initialCallReadAt(ev),
    })
  }

  // A call in either direction is contact — clear staleness so the nurture
  // cron doesn't nudge someone we just talked to.
  if (customerId) {
    await bumpLastContactForCustomer(supabase, customerId)
  }

  if (shouldSendMissedCallText(ev, isNewRow)) {
    const smsResult = await sendSMS(ev.phoneNumber, AUTO_MESSAGES.missed_call)

    // Log the auto-text
    await supabase.from('message_log').insert({
      customer_id: customerId,
      phone_number: ev.phoneNumber,
      direction: 'outbound',
      message: AUTO_MESSAGES.missed_call,
      trigger_type: 'missed_call',
      openphone_message_id: smsResult.messageId || null,
      status: smsResult.success ? 'sent' : 'failed',
    })
  }
}

async function handleTranscriptReady(body: any) {
  const supabase = getSupabaseAdmin()
  const data = body.data?.object || body.data || body
  const openphoneCallId = data.callId || data.id
  if (!openphoneCallId) {
    console.warn('[OpenPhone transcript] no callId on payload')
    return
  }

  try {
    const transcript = await fetchOpenPhoneTranscript(openphoneCallId)
    if (!transcript || !transcript.text) {
      console.log(`[OpenPhone transcript] empty for ${openphoneCallId}, skipping`)
      return
    }
    const { data: updated, error } = await supabase
      .from('call_log')
      .update({ transcript: transcript.text })
      .eq('openphone_call_id', openphoneCallId)
      .select('id')
      .maybeSingle()
    if (error) {
      console.error(`[OpenPhone transcript] update failed for ${openphoneCallId}:`, error.message)
      return
    }
    if (!updated) {
      console.warn(`[OpenPhone transcript] no call_log row for ${openphoneCallId} yet — cron will pick up`)
      return
    }
    console.log(`[OpenPhone transcript] saved for call ${openphoneCallId} (${transcript.text.length} chars)`)
  } catch (err) {
    console.error(`[OpenPhone transcript] fetch error for ${openphoneCallId}:`, err)
  }
}

async function handleIncomingMessage(body: any) {
  const supabase = getSupabaseAdmin()
  const ev = parseMessageEvent(body)
  if (!ev) return

  const customer = await findCustomerByPhone(supabase, ev.phoneNumber)
  const customerId = customer?.id ?? null

  // Attach the text to the customer's job only when it's unambiguous
  // (exactly one active job) so job views and timelines stay coherent.
  const jobId = customerId ? await findSingleActiveJobId(supabase, customerId) : null

  // Log incoming message
  await supabase.from('message_log').insert({
    customer_id: customerId,
    job_id: jobId,
    phone_number: ev.phoneNumber,
    direction: 'inbound',
    message: ev.content,
    trigger_type: 'customer_reply',
    status: 'delivered',
  })

  // A reply is contact: stop the stale-lead countdown and estimate nudges.
  if (customerId) {
    await bumpLastContactForCustomer(supabase, customerId)
  }
}
