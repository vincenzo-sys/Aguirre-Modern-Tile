import { NextRequest, NextResponse } from 'next/server'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import { requireApiOwner } from '@/lib/apiAuth'

export const maxDuration = 60

// POST /api/stripe/invoices/finalize - finalize and send a Stripe draft invoice
export async function POST(req: NextRequest) {
  const unauthorized = await requireApiOwner(req)
  if (unauthorized) return unauthorized

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

    // Fetch local invoice
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .single()

    if (invError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    if (!invoice.stripe_invoice_id) {
      return NextResponse.json(
        { error: 'No Stripe draft exists for this invoice. Create a draft first.' },
        { status: 400 }
      )
    }

    // Finalize then send
    const finalized = await stripe.invoices.finalizeInvoice(invoice.stripe_invoice_id)
    await stripe.invoices.sendInvoice(finalized.id)

    // Update local status to sent + cache the hosted pay URL for the
    // customer-facing /invoices/[token] "Pay now" button.
    await supabase
      .from('invoices')
      .update({
        status: 'sent',
        stripe_hosted_url: finalized.hosted_invoice_url ?? null,
      })
      .eq('id', invoice_id)

    return NextResponse.json({
      hosted_invoice_url: finalized.hosted_invoice_url,
      invoice_pdf: finalized.invoice_pdf,
    })
  } catch (err: unknown) {
    console.error('Stripe finalize error:', err)

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
