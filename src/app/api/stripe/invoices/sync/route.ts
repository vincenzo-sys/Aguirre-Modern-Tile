import { NextRequest, NextResponse } from 'next/server'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
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

    // Update local DB if status changed
    if (localStatus !== invoice.status) {
      await supabase
        .from('invoices')
        .update({ status: localStatus })
        .eq('id', invoice_id)

      // If newly paid, recalculate job.amount_paid
      if (localStatus === 'paid') {
        const { data: jobInvoices } = await supabase
          .from('invoices')
          .select('amount, status')
          .eq('job_id', invoice.job_id)

        const totalPaid = (jobInvoices ?? [])
          .filter((inv: { status: string }) => inv.status === 'paid')
          .reduce((sum: number, inv: { amount: number }) => sum + Number(inv.amount), 0)

        await supabase
          .from('jobs')
          .update({ amount_paid: totalPaid })
          .eq('id', invoice.job_id)
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
