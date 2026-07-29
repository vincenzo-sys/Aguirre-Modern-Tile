// Pure decision logic for the OpenPhone webhook, extracted so the choices
// that caused real bugs — auto-texting "sorry we missed you" while the phone
// was still ringing, double texts on webhook redelivery — are unit-testable
// without a DB (same pattern as openphoneSignature.ts).

export type CallEvent = {
  phoneNumber: string
  direction: 'inbound' | 'outbound'
  duration: number
  status: 'completed' | 'missed' | 'voicemail'
  recordingUrl: string | null
  openphoneCallId: string | null
}

export type MessageEvent = {
  phoneNumber: string
  content: string
}

// Only the terminal call event carries a real outcome. call.ringing used to
// run the same handler: duration 0 ⇒ "missed" ⇒ the missed-call auto-text
// fired while the phone was still ringing, plus a duplicate call_log row
// when call.completed arrived seconds later.
export function shouldHandleCallEvent(eventType: string): boolean {
  return eventType === 'call.completed'
}

export function parseCallEvent(body: unknown): CallEvent | null {
  const b = body as { data?: { object?: unknown } } | null | undefined
  const callData = (b?.data?.object || (b as { data?: unknown })?.data || b || {}) as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >

  const phoneNumber: string | null =
    callData.from || callData.callerNumber || callData.participants?.[0]?.phoneNumber || null
  if (!phoneNumber) return null

  const direction = callData.direction === 'outbound' ? 'outbound' : 'inbound'
  const duration = typeof callData.duration === 'number' ? callData.duration : 0
  const voicemailUrl: string | null = callData.voicemail?.url || null
  const status: CallEvent['status'] = voicemailUrl
    ? 'voicemail'
    : callData.status === 'missed' || duration === 0
      ? 'missed'
      : 'completed'

  return {
    phoneNumber,
    direction,
    duration,
    status,
    recordingUrl: callData.recordingUrl || callData.media?.url || voicemailUrl || null,
    openphoneCallId: callData.id || null,
  }
}

export function parseMessageEvent(body: unknown): MessageEvent | null {
  const b = body as { data?: { object?: unknown } } | null | undefined
  const msgData = (b?.data?.object || (b as { data?: unknown })?.data || b || {}) as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >
  const phoneNumber: string | null = msgData.from || msgData.participants?.[0]?.phoneNumber || null
  if (!phoneNumber) return null
  return { phoneNumber, content: msgData.body || msgData.content || '' }
}

// The auto-text goes out only for a call the customer is actually waiting
// on: inbound + unanswered + a call we haven't already logged (webhook
// redelivery updates the existing row and must not text twice).
export function shouldSendMissedCallText(ev: CallEvent, isNewRow: boolean): boolean {
  return isNewRow && ev.direction === 'inbound' && ev.status !== 'completed'
}

// Inbox read-state at insert time: only an inbound call the team didn't
// answer is "waiting on you". Answered calls and everything outbound are
// born read. (Used once migration 046 adds read_at.)
export function initialCallReadAt(
  ev: CallEvent,
  now: () => string = () => new Date().toISOString()
): string | null {
  const unread = ev.direction === 'inbound' && ev.status !== 'completed'
  return unread ? null : now()
}
