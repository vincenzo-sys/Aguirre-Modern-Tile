import { describe, it, expect } from 'vitest'
import {
  parseCallEvent,
  parseMessageEvent,
  shouldHandleCallEvent,
  shouldSendMissedCallText,
  initialCallReadAt,
  type CallEvent,
} from './openphoneEvents'

const call = (over: Partial<CallEvent> = {}): CallEvent => ({
  phoneNumber: '+16175551234',
  direction: 'inbound',
  duration: 45,
  status: 'completed',
  recordingUrl: null,
  openphoneCallId: 'AC123',
  ...over,
})

describe('shouldHandleCallEvent', () => {
  it('handles only call.completed', () => {
    expect(shouldHandleCallEvent('call.completed')).toBe(true)
  })

  it('ignores call.ringing — the premature missed-call-text bug', () => {
    expect(shouldHandleCallEvent('call.ringing')).toBe(false)
  })

  it('ignores unrelated events', () => {
    expect(shouldHandleCallEvent('message.received')).toBe(false)
    expect(shouldHandleCallEvent('call.recording.completed')).toBe(false)
  })
})

describe('parseCallEvent', () => {
  it('parses the nested data.object payload shape', () => {
    const ev = parseCallEvent({
      data: {
        object: {
          id: 'AC1',
          from: '+16175551234',
          direction: 'inbound',
          duration: 62,
          status: 'completed',
          recordingUrl: 'https://rec.example/1.mp3',
        },
      },
    })
    expect(ev).toEqual({
      phoneNumber: '+16175551234',
      direction: 'inbound',
      duration: 62,
      status: 'completed',
      recordingUrl: 'https://rec.example/1.mp3',
      openphoneCallId: 'AC1',
    })
  })

  it('treats duration 0 as missed', () => {
    const ev = parseCallEvent({ data: { from: '+16175551234', duration: 0 } })
    expect(ev?.status).toBe('missed')
  })

  it('detects voicemail and uses its url as the recording fallback', () => {
    const ev = parseCallEvent({
      data: { from: '+16175551234', duration: 0, voicemail: { url: 'https://vm.example/1.mp3' } },
    })
    expect(ev?.status).toBe('voicemail')
    expect(ev?.recordingUrl).toBe('https://vm.example/1.mp3')
  })

  it('falls back through from → callerNumber → participants for the number', () => {
    expect(
      parseCallEvent({ data: { callerNumber: '+19785550000', duration: 5 } })?.phoneNumber
    ).toBe('+19785550000')
    expect(
      parseCallEvent({ data: { participants: [{ phoneNumber: '+19785550001' }], duration: 5 } })
        ?.phoneNumber
    ).toBe('+19785550001')
  })

  it('returns null without a phone number', () => {
    expect(parseCallEvent({ data: { duration: 10 } })).toBeNull()
    expect(parseCallEvent(null)).toBeNull()
  })
})

describe('parseMessageEvent', () => {
  it('parses body and from', () => {
    const ev = parseMessageEvent({ data: { object: { from: '+16175551234', body: 'hey there' } } })
    expect(ev).toEqual({ phoneNumber: '+16175551234', content: 'hey there' })
  })

  it('falls back to content and defaults to empty string', () => {
    expect(parseMessageEvent({ data: { from: '+16175551234', content: 'hi' } })?.content).toBe('hi')
    expect(parseMessageEvent({ data: { from: '+16175551234' } })?.content).toBe('')
  })

  it('returns null without a phone number', () => {
    expect(parseMessageEvent({ data: { body: 'hi' } })).toBeNull()
  })
})

describe('shouldSendMissedCallText', () => {
  it('sends for a new inbound missed call', () => {
    expect(shouldSendMissedCallText(call({ status: 'missed', duration: 0 }), true)).toBe(true)
  })

  it('sends for a new inbound voicemail', () => {
    expect(shouldSendMissedCallText(call({ status: 'voicemail', duration: 0 }), true)).toBe(true)
  })

  it('never sends on webhook redelivery (existing row updated, not inserted)', () => {
    expect(shouldSendMissedCallText(call({ status: 'missed', duration: 0 }), false)).toBe(false)
  })

  it('never sends for answered or outbound calls', () => {
    expect(shouldSendMissedCallText(call({ status: 'completed' }), true)).toBe(false)
    expect(shouldSendMissedCallText(call({ direction: 'outbound', status: 'missed' }), true)).toBe(
      false
    )
  })
})

describe('initialCallReadAt', () => {
  const now = () => '2026-07-29T12:00:00.000Z'

  it('inbound missed and voicemail are born unread', () => {
    expect(initialCallReadAt(call({ status: 'missed' }), now)).toBeNull()
    expect(initialCallReadAt(call({ status: 'voicemail' }), now)).toBeNull()
  })

  it('answered inbound calls are born read', () => {
    expect(initialCallReadAt(call({ status: 'completed' }), now)).toBe(now())
  })

  it('outbound calls are always born read', () => {
    expect(initialCallReadAt(call({ direction: 'outbound', status: 'missed' }), now)).toBe(now())
  })
})
