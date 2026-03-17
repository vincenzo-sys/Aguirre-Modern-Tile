import { NextRequest, NextResponse } from 'next/server'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

// POST /api/stripe/customers - find or create a Stripe customer from a job's client info
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'Stripe is not configured. Add STRIPE_SECRET_KEY to .env.local' },
      { status: 503 }
    )
  }

  try {
    const body = await req.json()
    const { job_id } = body

    if (!job_id) {
      return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
    }

    const stripe = getStripe()
    const supabase = await createClient()

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', job_id)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (!job.client_email) {
      return NextResponse.json(
        { error: 'Job has no client email. Add a client email before creating a Stripe customer.' },
        { status: 422 }
      )
    }

    const email = job.client_email.toLowerCase()

    // Search for existing customer by email
    const existing = await stripe.customers.list({ email, limit: 1 })
    let created = false
    let customer = existing.data[0]

    if (!customer) {
      customer = await stripe.customers.create({
        email,
        name: job.client_name,
        phone: job.client_phone ?? undefined,
        metadata: { supabase_job_id: job.id },
      })
      created = true
    }

    // Save stripe_customer_id back to the job
    await supabase
      .from('jobs')
      .update({ stripe_customer_id: customer.id })
      .eq('id', job_id)

    return NextResponse.json({
      customer_id: customer.id,
      name: customer.name,
      email: customer.email,
      created,
    })
  } catch (err: unknown) {
    console.error('Stripe customer error:', err)

    if (err && typeof err === 'object' && 'type' in err) {
      const stripeErr = err as { type: string; message: string; code?: string; statusCode?: number }
      return NextResponse.json({
        error: stripeErr.message,
        stripe_error_type: stripeErr.type,
        stripe_error_code: stripeErr.code,
      }, { status: stripeErr.statusCode || 500 })
    }

    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
