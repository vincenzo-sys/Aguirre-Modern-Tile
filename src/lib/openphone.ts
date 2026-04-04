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
} as const
