import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, AUTO_MESSAGES } from '@/lib/openphone'

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
    const body = await req.json()
    const eventType = body.type || body.event

    console.log('OpenPhone webhook:', eventType, JSON.stringify(body).slice(0, 500))

    switch (eventType) {
      case 'call.completed':
      case 'call.ringing':
        await handleCall(body)
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
