import type Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { postToDiscord, DISCORD_COLORS } from '@/lib/discord'
import { TILE_KIT } from '@/data/tileKit'

export interface KitConfirmation {
  quoteRequestId: string
  clientName: string
  /** False when this call was a no-op because the kit was already marked paid. */
  newlyPaid: boolean
}

/**
 * Marks a Tile Match Kit lead as paid.
 *
 * Called from two places on purpose:
 *   1. /tile-samples/thanks — the browser lands there with the session id, so
 *      this works even though the Stripe webhook is registered on the apex
 *      domain and never actually delivers (apex 307s to www).
 *   2. the Stripe webhook — if/when that URL gets fixed, this is the path that
 *      catches customers who close the tab before the redirect completes.
 *
 * Idempotent by design: both callers can run, in any order, and the second one
 * detects `payment_status === 'paid'` and skips the write and the alert.
 */
export async function confirmKitPayment(
  session: Stripe.Checkout.Session
): Promise<KitConfirmation | null> {
  if (session.metadata?.type !== 'tile_kit') return null
  if (session.payment_status !== 'paid') return null

  const quoteRequestId = session.metadata.quote_request_id
  if (!quoteRequestId) {
    console.warn('[TileKit] paid session with no quote_request_id:', session.id)
    return null
  }

  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('quote_requests')
    .select('id, client_name, answers')
    .eq('id', quoteRequestId)
    .maybeSingle()

  if (!existing) {
    console.warn('[TileKit] paid session for unknown lead:', quoteRequestId)
    return null
  }

  const answers = (existing.answers ?? {}) as Record<string, string>
  const clientName = (existing.client_name as string) ?? ''

  if (answers.payment_status === 'paid') {
    return { quoteRequestId, clientName, newlyPaid: false }
  }

  const amount = Number(session.amount_total ?? 0) / 100

  await supabase
    .from('quote_requests')
    .update({
      answers: {
        ...answers,
        payment_status: 'paid',
        stripe_session_id: session.id,
        amount_paid: `$${amount.toFixed(2)}`,
      },
      // A paid kit is the strongest intent signal this funnel produces.
      priority: 'high',
    })
    .eq('id', quoteRequestId)

  postToDiscord({
    username: 'Tile Match Kit',
    embeds: [
      {
        title: `💳 Kit PAID: ${clientName || 'unknown'}`,
        description: `$${amount.toFixed(2)} collected. Pull ${TILE_KIT.sampleCount} samples and schedule the drop-off.`,
        color: DISCORD_COLORS.green,
        fields: [
          { name: 'Town', value: session.metadata.town || '—', inline: true },
          { name: 'Project', value: session.metadata.room || '—', inline: true },
          { name: 'Styles', value: answers.styles || '—', inline: false },
          { name: 'Lead', value: quoteRequestId, inline: false },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  }).catch((err) => console.error('[TileKit] paid alert failed:', err))

  return { quoteRequestId, clientName, newlyPaid: true }
}

/** Fetches the session from Stripe, then confirms it. */
export async function confirmKitPaymentBySessionId(
  sessionId: string
): Promise<KitConfirmation | null> {
  if (!isStripeConfigured()) return null
  const session = await getStripe().checkout.sessions.retrieve(sessionId)
  return confirmKitPayment(session)
}
