import { NextRequest, NextResponse } from 'next/server'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

// POST /api/stripe/invoices/draft - create a Stripe draft invoice (does NOT finalize/send)
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'Stripe is not configured. Add STRIPE_SECRET_KEY to .env.local' },
      { status: 503 }
    )
  }

  try {
    const body = await req.json()
    const { invoice_id } = body

    if (!invoice_id) {
      return NextResponse.json({ error: 'invoice_id is required' }, { status: 400 })
    }

    const stripe = getStripe()
    const supabase = await createClient()

    // Fetch the local invoice
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .single()

    if (invError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    if (invoice.stripe_invoice_id) {
      return NextResponse.json(
        { error: 'Invoice already has a Stripe draft', stripe_invoice_id: invoice.stripe_invoice_id },
        { status: 409 }
      )
    }

    // Fetch the associated job
    const { data: job } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', invoice.job_id)
      .single()

    if (!job) {
      return NextResponse.json({ error: 'Associated job not found' }, { status: 404 })
    }

    if (!job.client_email) {
      return NextResponse.json(
        { error: 'Job has no client email. Add a client email before creating a Stripe invoice.' },
        { status: 422 }
      )
    }

    // Find or create Stripe customer
    const email = job.client_email.toLowerCase()
    const existing = await stripe.customers.list({ email, limit: 1 })
    let customer = existing.data[0]

    if (!customer) {
      customer = await stripe.customers.create({
        email,
        name: job.client_name,
        phone: job.client_phone ?? undefined,
        metadata: { supabase_job_id: job.id },
      })
    }

    // Save customer ID to job if not already set
    if (!job.stripe_customer_id) {
      await supabase
        .from('jobs')
        .update({ stripe_customer_id: customer.id })
        .eq('id', job.id)
    }

    // Create Stripe draft invoice
    const daysUntilDue = Math.max(
      1,
      Math.ceil((new Date(invoice.due_date).getTime() - Date.now()) / 86400000)
    )

    const stripeInvoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: daysUntilDue,
      metadata: {
        supabase_invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
      },
    })

    // Add line items with type metadata
    const lineItems = (invoice.line_items as Array<{
      description: string
      quantity: number
      unit_price: number
      amount: number
      type?: 'product' | 'service'
      unit?: string
    }>) ?? []

    if (lineItems.length > 0) {
      await stripe.invoices.addLines(stripeInvoice.id, {
        lines: lineItems.map((item) => {
          const itemType = item.type || 'service'
          const prefix = itemType === 'product' ? '[Material]' : '[Labor]'

          return {
            description: `${prefix} ${item.description}`,
            quantity: item.quantity,
            price_data: {
              currency: 'usd',
              unit_amount: Math.round(item.unit_price * 100),
              product_data: {
                name: item.description,
              },
            },
            metadata: {
              type: itemType,
              ...(item.unit ? { unit: item.unit } : {}),
            },
          }
        }),
      })
    }

    // Save stripe_invoice_id to local invoice (keep status as draft)
    await supabase
      .from('invoices')
      .update({ stripe_invoice_id: stripeInvoice.id })
      .eq('id', invoice_id)

    return NextResponse.json({
      stripe_invoice_id: stripeInvoice.id,
      stripe_status: 'draft',
    })
  } catch (err: unknown) {
    console.error('Stripe draft invoice error:', err)

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
