import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getStripe, isStripeConfigured } from '@/lib/stripe'

// POST /api/public/estimates/[token]/checkout
// Public — creates a Stripe Checkout Session for the 10% deposit.
// On success, Stripe fires checkout.session.completed → webhook records
// the deposit against the job.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    if (!isStripeConfigured()) {
      return NextResponse.json({ error: 'Payments not configured' }, { status: 503 })
    }

    const supabase = createServiceClient()

    const { data: job, error } = await supabase
      .from('jobs')
      .select(
        'id, title, client_name, client_email, estimated_cost, amount_paid, estimate_accepted_at'
      )
      .eq('estimate_token', token)
      .single()

    if (error || !job) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }

    if (job.estimate_accepted_at || (job.amount_paid ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Deposit has already been recorded for this estimate.' },
        { status: 409 }
      )
    }

    if (!job.estimated_cost || Number(job.estimated_cost) <= 0) {
      return NextResponse.json(
        { error: 'This estimate has no price yet — contact us directly.' },
        { status: 400 }
      )
    }

    const depositCents = Math.round(Number(job.estimated_cost) * 0.1 * 100)

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
      req.nextUrl.origin

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: depositCents,
            product_data: {
              name: `${job.title} — 10% Deposit`,
              description: `Reserves your install date with Aguirre Modern Tile.`,
            },
          },
          quantity: 1,
        },
      ],
      customer_email: job.client_email || undefined,
      metadata: {
        job_id: job.id,
        estimate_token: token,
        type: 'estimate_deposit',
      },
      success_url: `${baseUrl}/estimates/${token}?deposit=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/estimates/${token}?deposit=cancelled`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Checkout session error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
