import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyOpenPhoneSignature } from './openphoneSignature'

// The signing secret is base64 (as OpenPhone provides it).
const secret = Buffer.from('super-secret-signing-key').toString('base64')

function sign(rawBody: string, ts: string, key: string = secret): string {
  const sig = createHmac('sha256', Buffer.from(key, 'base64'))
    .update(`${ts}.${rawBody}`)
    .digest('base64')
  return `hmac;1;${ts};${sig}`
}

describe('verifyOpenPhoneSignature', () => {
  const body = JSON.stringify({ type: 'message.received', data: { id: 'm1' } })
  const ts = '1700000000'

  it('accepts a correctly signed body', () => {
    expect(verifyOpenPhoneSignature(body, sign(body, ts), secret)).toBe(true)
  })

  it('rejects a tampered body (attacker changed the payload)', () => {
    const header = sign(body, ts)
    expect(verifyOpenPhoneSignature(body + ' ', header, secret)).toBe(false)
  })

  it('rejects a signature made with the wrong secret (forged event)', () => {
    const otherKey = Buffer.from('a-different-key').toString('base64')
    expect(verifyOpenPhoneSignature(body, sign(body, ts, otherKey), secret)).toBe(false)
  })

  it('rejects a tampered timestamp (replay-shift)', () => {
    const parts = sign(body, ts).split(';')
    parts[2] = '1700000001'
    expect(verifyOpenPhoneSignature(body, parts.join(';'), secret)).toBe(false)
  })

  it('rejects a missing or malformed header', () => {
    expect(verifyOpenPhoneSignature(body, null, secret)).toBe(false)
    expect(verifyOpenPhoneSignature(body, 'garbage', secret)).toBe(false)
    expect(verifyOpenPhoneSignature(body, 'hmac;1;1700000000', secret)).toBe(false) // no sig segment
    expect(verifyOpenPhoneSignature(body, 'hmac;1;;', secret)).toBe(false) // empty ts + sig
  })

  it('rejects a signature of the right length but wrong bytes (constant-time path)', () => {
    const good = sign(body, ts)
    const parts = good.split(';')
    // Flip one base64 char in the signature while keeping it valid base64 of the
    // same byte length.
    const sig = parts[3]
    parts[3] = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
    expect(verifyOpenPhoneSignature(body, parts.join(';'), secret)).toBe(false)
  })
})
