const PHONE_RE = /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidPhone(phone: string): boolean {
  return PHONE_RE.test(phone.trim())
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim())
}

export function isValidName(name: string): boolean {
  return name.trim().length >= 2
}

export function validateContact(fields: { name: string; email: string; phone: string }) {
  const errors: Record<string, string> = {}
  if (!isValidName(fields.name)) errors.name = 'Name must be at least 2 characters'
  if (!isValidEmail(fields.email)) errors.email = 'Enter a valid email address'
  if (!isValidPhone(fields.phone)) errors.phone = 'Enter a valid phone number, e.g. (617) 555-1234'
  return errors
}

// Sanitize string input — strip HTML tags to prevent injection in emails
export function sanitize(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim().slice(0, 2000)
}

// In-memory rate limiter for API routes
// Tracks requests per IP with a sliding window
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(
  ip: string,
  { maxRequests = 5, windowMs = 60_000 } = {}
): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxRequests - 1 }
  }

  entry.count++

  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0 }
  }

  return { allowed: true, remaining: maxRequests - entry.count }
}
