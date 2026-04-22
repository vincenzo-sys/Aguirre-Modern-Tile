// OpenPhone API client for call management and SMS

const OPENPHONE_API_BASE = 'https://api.openphone.com/v1'

function getApiKey(): string {
  const key = process.env.OPENPHONE_API_KEY
  if (!key) throw new Error('OPENPHONE_API_KEY not set')
  return key
}

function getPhoneNumberId(): string {
  return process.env.OPENPHONE_PHONE_NUMBER_ID || ''
}

async function openphoneFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${OPENPHONE_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': getApiKey(),
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  return res
}

// Send an SMS via OpenPhone
export async function sendSMS(to: string, body: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const phoneNumberId = getPhoneNumberId()
    if (!phoneNumberId) {
      console.error('OPENPHONE_PHONE_NUMBER_ID not set — cannot send SMS')
      return { success: false, error: 'Phone number not configured' }
    }

    const res = await openphoneFetch('/messages', {
      method: 'POST',
      body: JSON.stringify({
        content: body,
        to: [to],
        from: phoneNumberId,
      }),
    })

    if (!res.ok) {
      const data = await res.text()
      console.error('OpenPhone SMS error:', res.status, data)
      return { success: false, error: `OpenPhone API error: ${res.status}` }
    }

    const data = await res.json()
    return { success: true, messageId: data.data?.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('OpenPhone SMS error:', message)
    return { success: false, error: message }
  }
}

// Normalize a US phone number to E.164 (+1XXXXXXXXXX). Returns null if
// we can't confidently produce an E.164 number (OpenPhone requires it).
export function toE164(raw: string): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (trimmed.startsWith('+')) {
    const digits = trimmed.replace(/\D/g, '')
    return digits.length >= 10 ? `+${digits}` : null
  }
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0] || '', lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

// Create a contact in OpenPhone so incoming calls/texts show a name.
// Non-fatal: callers should ignore failures. Requires OPENPHONE_API_KEY.
// Optionally reads OPENPHONE_USER_ID to set createdByUserId (some workspace
// configs require it — if your workspace doesn't, leave it unset).
export async function createOpenPhoneContact(input: {
  name: string
  email?: string | null
  phone?: string | null
  source?: string
}): Promise<{ success: boolean; contactId?: string; error?: string }> {
  try {
    if (!process.env.OPENPHONE_API_KEY) {
      return { success: false, error: 'OPENPHONE_API_KEY not set' }
    }

    const e164 = input.phone ? toE164(input.phone) : null
    if (!e164 && !input.email) {
      return { success: false, error: 'No phone (E.164) or email to register' }
    }

    const { firstName, lastName } = splitName(input.name || '')

    const defaultFields: Record<string, unknown> = {
      firstName: firstName || 'Website',
      lastName: lastName || 'Lead',
    }
    if (e164) {
      defaultFields.phoneNumbers = [{ name: 'Mobile', value: e164 }]
    }
    if (input.email) {
      defaultFields.emails = [{ name: 'Email', value: input.email }]
    }

    const body: Record<string, unknown> = {
      defaultFields,
      source: input.source || 'aguirre-tile-website',
    }
    if (process.env.OPENPHONE_USER_ID) {
      body.createdByUserId = process.env.OPENPHONE_USER_ID
    }

    const res = await openphoneFetch('/contacts', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('OpenPhone createContact error:', res.status, text)
      return { success: false, error: `OpenPhone API error: ${res.status}` }
    }

    const data = await res.json()
    return { success: true, contactId: data?.data?.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('OpenPhone createContact error:', message)
    return { success: false, error: message }
  }
}

// Auto-text templates
export const AUTO_MESSAGES = {
  missed_call: `Hi! Thanks for calling Aguirre Modern Tile. We missed your call but we'll get back to you shortly. For a quick quote, visit aguirremoderntile.com/quote`,

  status_scheduled: (date: string) =>
    `Great news! Your tile project with Aguirre Modern Tile is scheduled for ${date}. We'll see you then! Questions? Just reply to this text.`,

  status_in_progress: (address: string) =>
    `Our crew is on site${address ? ` at ${address}` : ''} today. We'll keep you updated on progress. - Aguirre Modern Tile`,

  status_completed: `Your tile work is complete! We hope you love the results. We'll send the final invoice shortly. Thank you for choosing Aguirre Modern Tile!`,

  invoice_sent: (amount: string, invoiceNumber: string) =>
    `Invoice ${invoiceNumber} for ${amount} has been sent to your email. Thank you! - Aguirre Modern Tile`,

  estimate_viewed_nudge: (estimateUrl: string, nudgeNumber: number) => {
    const opener =
      nudgeNumber === 1
        ? 'Just checking in'
        : nudgeNumber === 2
          ? 'Wanted to follow up'
          : 'Last check-in from me'
    return `${opener} on your tile estimate — any questions I can answer? You can review and pay the 10% deposit here: ${estimateUrl}. Happy to hop on a quick call too. - Vince, Aguirre Modern Tile`
  },
} as const
