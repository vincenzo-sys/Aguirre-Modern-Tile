import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, AUTO_MESSAGES } from '@/lib/openphone'
import { fetchOpenPhoneTranscript } from '@/lib/openphoneTranscripts'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const maxDuration = 30

// Verify the OpenPhone webhook signature over the RAW body. OpenPhone signs as
// `hmac;<version>;<timestamp>;<base64-signature>`, where the signature is
// HMAC-SHA256 of `${timestamp}.${rawBody}` keyed by the base64-decoded signing
// secret. Returns true only on a byte-exact, constant-time match.
function verifyOpenPhoneSignature(
  rawBody: string,
  header: string | null,
  secret: string
): boolean {
  if (!header) return false
  const parts = header.split(';')
  if (parts.length < 4) return false
  const timestamp = parts[2]
  const providedSig = parts[3]
  if (!timestamp || !providedSig) return false

  const expected = createHmac('sha256', Buffer.from(secret, 'base64'))
    .update(`${timestamp}.${rawBody}`)
    .digest()
  const provided = Buffer.from(providedSig, 'base64')
  if (provided.length !== expected.length) return false
  return timingSafeEqual(provided, expected)
}

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
      case 'call.ringing':
        await handleCall(body)
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
  const callData = body.data?.object || body.data || body

  const phoneNumber = callData.from || callData.callerNumber || callData.participants?.[0]?.phoneNumber
  const direction = callData.direction || 'inbound'
  const duration = callData.duration || 0
  const status = callData.status === 'missed' || duration === 0 ? 'missed' : 'completed'
  const recordingUrl = callData.recordingUrl || callData.media?.url || null
  const openphoneCallId = callData.id || null

  if (!phoneNumber) {
    console.warn('OpenPhone webhook: no phone number found')
    return
  }

  // Find or create customer by phone number
  let customerId: string | null = null
  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('phone', phoneNumber)
    .limit(1)
    .single()

  if (existing) {
    customerId = existing.id
  } else {
    // Auto-create customer from caller
    const { data: newCust } = await supabase
      .from('customers')
      .insert({
        name: phoneNumber, // Will be updated when we learn their name
        phone: phoneNumber,
        source: 'manual',
        notes: `Auto-created from ${status === 'missed' ? 'missed' : 'incoming'} call on ${new Date().toLocaleDateString()}`,
      })
      .select('id')
      .single()

    if (newCust) customerId = newCust.id
  }

  // Log the call
  await supabase.from('call_log').insert({
    customer_id: customerId,
    phone_number: phoneNumber,
    direction,
    status,
    duration,
    recording_url: recordingUrl,
    openphone_call_id: openphoneCallId,
  })

  // Auto-text back on missed calls
  if (status === 'missed' && direction === 'inbound') {
    const smsResult = await sendSMS(phoneNumber, AUTO_MESSAGES.missed_call)

    // Log the auto-text
    await supabase.from('message_log').insert({
      customer_id: customerId,
      phone_number: phoneNumber,
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
  const msgData = body.data?.object || body.data || body

  const phoneNumber = msgData.from || msgData.participants?.[0]?.phoneNumber
  const content = msgData.body || msgData.content || ''

  if (!phoneNumber) return

  // Find customer
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('phone', phoneNumber)
    .limit(1)
    .single()

  // Log incoming message
  await supabase.from('message_log').insert({
    customer_id: customer?.id || null,
    phone_number: phoneNumber,
    direction: 'inbound',
    message: content,
    trigger_type: 'customer_reply',
    status: 'delivered',
  })
}
