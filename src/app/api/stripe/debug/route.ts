import { NextResponse } from 'next/server'

// Temporary debug endpoint - remove after verifying
export async function GET() {
  const sk = process.env.STRIPE_SECRET_KEY
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  const wh = process.env.STRIPE_WEBHOOK_SECRET

  return NextResponse.json({
    secret_key_set: !!sk,
    secret_key_prefix: sk ? sk.substring(0, 8) + '...' : null,
    secret_key_length: sk?.length ?? 0,
    publishable_key_set: !!pk,
    webhook_secret_set: !!wh,
  })
}
