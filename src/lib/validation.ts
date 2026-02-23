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
