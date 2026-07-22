import { NextRequest, NextResponse } from 'next/server'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import { requireApiOwner } from '@/lib/apiAuth'
import { recomputeJobFinancials } from '@/lib/jobPayments'
import type { InvoiceStatus } from '@/lib/supabase/types'

export const maxDuration = 60

// Map Stripe invoice statuses to our local statuses
function mapStripeStatus(stripeStatus: string): InvoiceStatus {
  switch (stripeStatus) {
    case 'draft': return 'draft'
    case 'open': return 'sent'
    case 'paid': return 'paid'
    case 'void': return 'void'
    case 'uncollectible': return 'overdue'
    default: return 'sent'
  }
}

// POST /api/stripe/invoices/sync - poll Stripe for current invoice state and sync locally
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
        { error: 'No Stripe invoice linked. Create a draft or send via Stripe first.' },
        { status: 400 }
      )
    }

    // Retrieve current state from Stripe
    const stripeInvoice = await stripe.invoices.retrieve(invoice.stripe_invoice_id)
    const localStatus = mapStripeStatus(stripeInvoice.status ?? 'draft')

    // Backfill the cached hosted pay URL whenever we learn it — keeps the
    // customer-facing /invoices/[token] "Pay now" button working for older
    // invoices sent before stripe_hosted_url existed.
    if (stripeInvoice.hosted_invoice_url && stripeInvoice.hosted_invoice_url !== invoice.stripe_hosted_url) {
      await supabase
        .from('invoices')
        .update({ stripe_hosted_url: stripeInvoice.hosted_invoice_url })
        .eq('id', invoice_id)
    }

    // Update local DB if status changed
    if (localStatus !== invoice.status) {
      await supabase
        .from('invoices')
        .update({ status: localStatus })
        .eq('id', invoice_id)

      // If newly paid or voided, recompute the job's rollups from all payment
      // channels (paid invoices + manual final payment). Summing only paid
      // invoices here wiped the deposit / final payment. See recomputeJobFinancials.
      if (localStatus === 'paid' || localStatus === 'void') {
        await recomputeJobFinancials(supabase, invoice.job_id)
      }
    }

    return NextResponse.json({
      stripe_status: stripeInvoice.status,
      local_status: localStatus,
      hosted_invoice_url: stripeInvoice.hosted_invoice_url,
      invoice_pdf: stripeInvoice.invoice_pdf,
      amount_due: stripeInvoice.amount_due,
      amount_paid: stripeInvoice.amount_paid,
      synced: localStatus !== invoice.status,
    })
  } catch (err: unknown) {
    console.error('Stripe sync error:', err)

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
