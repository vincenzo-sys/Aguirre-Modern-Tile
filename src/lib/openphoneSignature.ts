import { createHmac, timingSafeEqual } from 'node:crypto'

// Verify an OpenPhone webhook signature over the RAW request body. OpenPhone
// signs as `hmac;<version>;<timestamp>;<base64-signature>`, where the signature
// is HMAC-SHA256 of `${timestamp}.${rawBody}` keyed by the base64-decoded
// signing secret. Returns true only on a byte-exact, constant-time match.
export function verifyOpenPhoneSignature(
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

// Verify against ANY of several comma-separated signing secrets.
//
// OpenPhone issues a distinct key per webhook, and the dashboard registers
// two (one for messages, one for calls) both pointing at the same endpoint —
// so a single-secret check would reject every event from one of them.
// Also gives us zero-downtime key rotation: list old and new, drop the old
// once traffic has moved.
export function verifyOpenPhoneSignatureAny(
  rawBody: string,
  header: string | null,
  secrets: string
): boolean {
  return secrets
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .some((secret) => verifyOpenPhoneSignature(rawBody, header, secret))
}
