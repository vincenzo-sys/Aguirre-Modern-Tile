import { NextRequest, NextResponse } from 'next/server'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

// POST /api/stripe - send an invoice via Stripe
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

    // 1. Fetch the invoice with its associated job
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
        { error: 'Invoice has already been sent via Stripe', stripe_invoice_id: invoice.stripe_invoice_id },
        { status: 409 }
      )
    }

    // Fetch the associated job for client details
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
        { error: 'Job has no client email. Add a client email to the job before sending an invoice.' },
        { status: 422 }
      )
    }

    // 2. Find or create a Stripe customer by email
    const existingCustomers = await stripe.customers.list({
      email: job.client_email,
      limit: 1,
    })

    const customer = existingCustomers.data[0] ?? await stripe.customers.create({
      email: job.client_email,
      name: job.client_name,
      phone: job.client_phone ?? undefined,
      metadata: {
        supabase_job_id: job.id,
      },
    })

    // 3. Create Stripe invoice
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

    // 4. Add line items from our invoice
    const lineItems = (invoice.line_items as Array<{
      description: string
      quantity: number
      unit_price: number
      amount: number
    }>) ?? []

    if (lineItems.length > 0) {
      await stripe.invoices.addLines(stripeInvoice.id, {
        lines: lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(item.unit_price * 100), // Stripe uses cents
            product_data: {
              name: item.description,
            },
          },
        })),
      })
    }

    // 5. Finalize and send the invoice
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(stripeInvoice.id)
    await stripe.invoices.sendInvoice(finalizedInvoice.id)

    // 6. Update our local record with Stripe info
    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        stripe_invoice_id: finalizedInvoice.id,
        status: 'sent' as const,
      })
      .eq('id', invoice_id)

    if (updateError) {
      console.error('Failed to update local invoice after Stripe send:', updateError)
    }

    return NextResponse.json({
      success: true,
      stripe_invoice_id: finalizedInvoice.id,
      hosted_invoice_url: finalizedInvoice.hosted_invoice_url,
      invoice_pdf: finalizedInvoice.invoice_pdf,
    })
  } catch (err: unknown) {
    console.error('Stripe invoice error:', err)

    // Return detailed error info for debugging
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
