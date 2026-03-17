import { NextResponse } from 'next/server'
import { getStripe, isStripeConfigured } from '@/lib/stripe'

// Temporary debug endpoint - remove after verifying
export const maxDuration = 30

export async function GET() {
  const sk = process.env.STRIPE_SECRET_KEY
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  const wh = process.env.STRIPE_WEBHOOK_SECRET

  const envInfo = {
    secret_key_set: !!sk,
    secret_key_prefix: sk ? sk.substring(0, 8) + '...' : null,
    secret_key_length: sk?.length ?? 0,
    publishable_key_set: !!pk,
    webhook_secret_set: !!wh,
  }

  // Try a simple Stripe API call
  if (!isStripeConfigured()) {
    return NextResponse.json({ ...envInfo, stripe_test: 'not configured' })
  }

  try {
    const stripe = getStripe()
    const balance = await stripe.balance.retrieve()
    return NextResponse.json({
      ...envInfo,
      stripe_test: 'success',
      currency: balance.available?.[0]?.currency ?? 'unknown',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const type = err && typeof err === 'object' && 'type' in err ? (err as { type: string }).type : undefined
    return NextResponse.json({
      ...envInfo,
      stripe_test: 'failed',
      error: message,
      error_type: type,
    })
  }
}
