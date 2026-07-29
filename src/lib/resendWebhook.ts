import { createHmac, timingSafeEqual } from 'node:crypto'

// Resend webhook verification + payload parsing (pure, unit-testable —
// same pattern as openphoneSignature.ts / openphoneEvents.ts).
//
// Resend signs webhooks with Svix: the signature is HMAC-SHA256 over
// `${svix-id}.${svix-timestamp}.${rawBody}`, keyed with the base64-decoded
// secret (after the `whsec_` prefix). The svix-signature header can carry
// several space-separated `v1,<base64>` entries (key rotation) — any match
// passes.

const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60

export function verifySvixSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  const { id, timestamp, signature } = headers
  if (!id || !timestamp || !signature) return false

  // Reject stale/future timestamps to blunt replay attacks.
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > TIMESTAMP_TOLERANCE_SECONDS) {
    return false
  }

  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest()

  return signature.split(' ').some((part) => {
    const [version, sig] = part.split(',')
    if (version !== 'v1' || !sig) return false
    const provided = Buffer.from(sig, 'base64')
    return provided.length === expected.length && timingSafeEqual(provided, expected)
  })
}

// "Jane Doe <jane@example.com>" → "jane@example.com"; bare addresses pass
// through. Lowercased so DB matching is exact. Null when nothing address-like.
export function extractEmailAddress(raw: unknown): string | null {
  let s: string | null = null
  if (typeof raw === 'string') s = raw
  else if (raw && typeof raw === 'object') {
    const o = raw as { email?: string; address?: string }
    s = o.email ?? o.address ?? null
  }
  if (!s) return null
  const angled = s.match(/<([^<>\s]+@[^<>\s]+)>/)
  const candidate = (angled ? angled[1] : s).trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null
}

export type EmailReceivedEvent = {
  emailId: string
  from: string | null // bare lowercased address
  to: string | null
  subject: string | null
  messageId: string | null
}

// The email.received webhook carries metadata only (no body — that comes
// from GET /emails/receiving/{id}).
export function parseEmailReceivedEvent(body: unknown): EmailReceivedEvent | null {
  const b = body as { type?: string; data?: Record<string, unknown> } | null
  if (!b || b.type !== 'email.received' || !b.data) return null
  const d = b.data
  const emailId = (d.email_id ?? d.id) as string | undefined
  if (!emailId || typeof emailId !== 'string') return null
  const firstTo = Array.isArray(d.to) ? d.to[0] : d.to
  return {
    emailId,
    from: extractEmailAddress(d.from),
    to: extractEmailAddress(firstTo),
    subject: typeof d.subject === 'string' ? d.subject : null,
    messageId: typeof d.message_id === 'string' ? d.message_id : null,
  }
}
