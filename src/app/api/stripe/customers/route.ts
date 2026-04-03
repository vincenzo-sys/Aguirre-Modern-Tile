import { NextRequest, NextResponse } from 'next/server'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import type { Job } from '@/lib/supabase/types'

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

    const typedJob = job as Job

    // Check for customer record (CRM) first
    type CustomerSlice = { id: string; stripe_customer_id: string | null; name: string; email: string | null; phone: string | null }
    let customerRecord: CustomerSlice | null = null
    if (typedJob.customer_id) {
      const { data: custData } = await supabase
        .from('customers')
        .select('id, stripe_customer_id, name, email, phone')
        .eq('id', typedJob.customer_id)
        .single()
      customerRecord = custData as CustomerSlice | null
    }

    const email = (customerRecord?.email ?? typedJob.client_email)?.toLowerCase()
    const name = customerRecord?.name ?? typedJob.client_name
    const phone = customerRecord?.phone ?? typedJob.client_phone

    if (!email) {
      return NextResponse.json(
        { error: 'No client email found. Add a client email before creating a Stripe customer.' },
        { status: 422 }
      )
    }

    // If we already have a stripe_customer_id in the customers table, use it
    if (customerRecord?.stripe_customer_id) {
      return NextResponse.json({
        customer_id: customerRecord.stripe_customer_id,
        name,
        email,
        created: false,
      })
    }

    // Search for existing Stripe customer by email
    const existing = await stripe.customers.list({ email, limit: 1 })
    let created = false
    let customer = existing.data[0]

    if (!customer) {
      customer = await stripe.customers.create({
        email,
        name,
        phone: phone ?? undefined,
        metadata: { supabase_job_id: typedJob.id },
      })
      created = true
    }

    // Save stripe_customer_id to the customers table (preferred) and job (backward compat)
    if (customerRecord) {
      await supabase
        .from('customers')
        .update({ stripe_customer_id: customer.id })
        .eq('id', customerRecord.id)
    }
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
