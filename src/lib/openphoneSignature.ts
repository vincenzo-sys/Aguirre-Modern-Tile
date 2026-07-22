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
