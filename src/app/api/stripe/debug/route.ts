import { NextResponse } from 'next/server'
import { getStripe, isStripeConfigured } from '@/lib/stripe'

export const maxDuration = 60

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

  if (!isStripeConfigured()) {
    return NextResponse.json({ ...envInfo, stripe_test: 'not configured' })
  }

  // Test 1: Raw fetch to Stripe API (with timing)
  let rawFetchResult = 'not tested'
  let rawFetchMs = 0
  try {
    const start = performance.now()
    const rawRes = await fetch('https://api.stripe.com/v1/balance', {
      headers: {
        'Authorization': `Bearer ${sk}`,
      },
    })
    rawFetchMs = Math.round(performance.now() - start)
    rawFetchResult = `status=${rawRes.status}`
  } catch (err: unknown) {
    rawFetchMs = Math.round(performance.now())
    rawFetchResult = `error: ${err instanceof Error ? err.message : 'unknown'}`
  }

  // Test 2: Stripe SDK (with timing)
  let sdkResult = 'not tested'
  let sdkMs = 0
  try {
    const start = performance.now()
    const stripe = getStripe()
    const balance = await stripe.balance.retrieve()
    sdkMs = Math.round(performance.now() - start)
    sdkResult = `success, currency=${balance.available?.[0]?.currency ?? 'unknown'}`
  } catch (err: unknown) {
    sdkMs = Math.round(performance.now())
    const message = err instanceof Error ? err.message : 'Unknown error'
    const type = err && typeof err === 'object' && 'type' in err ? (err as { type: string }).type : undefined
    sdkResult = `failed: ${type} - ${message}`
  }

  return NextResponse.json({
    ...envInfo,
    raw_fetch: rawFetchResult,
    raw_fetch_ms: rawFetchMs,
    sdk_test: sdkResult,
    sdk_test_ms: sdkMs,
    config: {
      timeout: 60000,
      maxNetworkRetries: 2,
      httpClient: 'FetchHttpClient',
      telemetry: false,
    },
    timestamp: new Date().toISOString(),
  })
}
