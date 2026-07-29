import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifySvixSignature,
  extractEmailAddress,
  parseEmailReceivedEvent,
} from './resendWebhook'

const SECRET_KEY = Buffer.from('test-secret-key-for-svix')
const SECRET = `whsec_${SECRET_KEY.toString('base64')}`
const NOW = 1_800_000_000

function sign(id: string, timestamp: number, body: string): string {
  const sig = createHmac('sha256', SECRET_KEY).update(`${id}.${timestamp}.${body}`).digest('base64')
  return `v1,${sig}`
}

describe('verifySvixSignature', () => {
  const body = '{"type":"email.received"}'

  it('accepts a valid signature', () => {
    const h = { id: 'msg_1', timestamp: String(NOW), signature: sign('msg_1', NOW, body) }
    expect(verifySvixSignature(body, h, SECRET, NOW)).toBe(true)
  })

  it('accepts when any of several space-separated signatures matches', () => {
    const h = {
      id: 'msg_1',
      timestamp: String(NOW),
      signature: `v1,${Buffer.from('wrong-signature-padding-ok').toString('base64')} ${sign('msg_1', NOW, body)}`,
    }
    expect(verifySvixSignature(body, h, SECRET, NOW)).toBe(true)
  })

  it('rejects a tampered body', () => {
    const h = { id: 'msg_1', timestamp: String(NOW), signature: sign('msg_1', NOW, body) }
    expect(verifySvixSignature(body + 'x', h, SECRET, NOW)).toBe(false)
  })

  it('rejects missing headers', () => {
    expect(verifySvixSignature(body, { id: null, timestamp: String(NOW), signature: 'v1,x' }, SECRET, NOW)).toBe(false)
  })

  it('rejects stale timestamps (replay protection)', () => {
    const old = NOW - 6 * 60
    const h = { id: 'msg_1', timestamp: String(old), signature: sign('msg_1', old, body) }
    expect(verifySvixSignature(body, h, SECRET, NOW)).toBe(false)
  })

  it('rejects wrong version prefix', () => {
    const h = {
      id: 'msg_1',
      timestamp: String(NOW),
      signature: sign('msg_1', NOW, body).replace(/^v1,/, 'v2,'),
    }
    expect(verifySvixSignature(body, h, SECRET, NOW)).toBe(false)
  })
})

describe('extractEmailAddress', () => {
  it('extracts from display-name format and lowercases', () => {
    expect(extractEmailAddress('Jane Doe <Jane@Example.COM>')).toBe('jane@example.com')
  })

  it('passes bare addresses through', () => {
    expect(extractEmailAddress('bill@example.com')).toBe('bill@example.com')
  })

  it('handles object shapes', () => {
    expect(extractEmailAddress({ email: 'a@b.co' })).toBe('a@b.co')
    expect(extractEmailAddress({ address: 'c@d.co' })).toBe('c@d.co')
  })

  it('returns null for junk', () => {
    expect(extractEmailAddress('not an email')).toBeNull()
    expect(extractEmailAddress(null)).toBeNull()
    expect(extractEmailAddress(42)).toBeNull()
  })
})

describe('parseEmailReceivedEvent', () => {
  it('parses the documented shape', () => {
    const ev = parseEmailReceivedEvent({
      type: 'email.received',
      data: {
        email_id: 'rcv_123',
        from: 'Jane <jane@example.com>',
        to: ['vince@reply.moderntile.pro'],
        subject: 'Question about my estimate',
        message_id: '<abc@mail.example.com>',
      },
    })
    expect(ev).toEqual({
      emailId: 'rcv_123',
      from: 'jane@example.com',
      to: 'vince@reply.moderntile.pro',
      subject: 'Question about my estimate',
      messageId: '<abc@mail.example.com>',
    })
  })

  it('falls back to data.id for the email id', () => {
    expect(
      parseEmailReceivedEvent({ type: 'email.received', data: { id: 'rcv_9', from: 'a@b.co' } })
        ?.emailId
    ).toBe('rcv_9')
  })

  it('rejects other event types and malformed payloads', () => {
    expect(parseEmailReceivedEvent({ type: 'email.sent', data: { email_id: 'x' } })).toBeNull()
    expect(parseEmailReceivedEvent({ type: 'email.received' })).toBeNull()
    expect(parseEmailReceivedEvent(null)).toBeNull()
  })
})
