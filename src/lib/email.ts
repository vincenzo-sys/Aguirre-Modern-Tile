// Single sendCustomerEmail helper used by every customer-facing email
// trigger (quote confirmation, estimate ready, deposit confirmation, etc.).
//
// Two reasons this lives in one place:
// 1. The configured-from-with-fallback retry pattern is non-obvious — Resend
//    rejects sends from unverified domains, so we fall back to the universal
//    `onboarding@resend.dev` sender if needed. Without this, sends silently
//    fail until DNS propagates.
// 2. Customer trust depends on consistent branding across every email. One
//    helper means one place to swap the from-address, signature, etc.

import { Resend } from 'resend'

const CONFIGURED_FROM =
  process.env.RESEND_FROM_EMAIL || 'Aguirre Modern Tile <onboarding@resend.dev>'
const RESEND_FALLBACK_FROM = 'Aguirre Modern Tile <onboarding@resend.dev>'

export type CustomerEmailResult = {
  success: boolean
  id?: string
  error?: string
  // When true, the configured FROM was rejected and the fallback was used.
  // Surface this so callers can record domain-verification status.
  usedFallback?: boolean
}

interface SendArgs {
  to: string
  subject: string
  html: string
  replyTo?: string
}

export async function sendCustomerEmail({
  to,
  subject,
  html,
  replyTo,
}: SendArgs): Promise<CustomerEmailResult> {
  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY not set' }
  }
  const resend = new Resend(process.env.RESEND_API_KEY)

  try {
    const sent = await resend.emails.send({
      from: CONFIGURED_FROM,
      to: [to],
      subject,
      html,
      replyTo,
    })
    if (!sent.error) {
      return { success: true, id: sent.data?.id }
    }
    const isDomainErr = /domain is not verified|not allowed/i.test(sent.error.message)
    if (isDomainErr && CONFIGURED_FROM !== RESEND_FALLBACK_FROM) {
      const retry = await resend.emails.send({
        from: RESEND_FALLBACK_FROM,
        to: [to],
        subject,
        html,
        replyTo,
      })
      if (retry.error) {
        return { success: false, error: retry.error.message, usedFallback: true }
      }
      return { success: true, id: retry.data?.id, usedFallback: true }
    }
    return { success: false, error: sent.error.message }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Email failed',
    }
  }
}
