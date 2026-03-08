import { NextRequest, NextResponse } from 'next/server'

// Stripe scaffolding - uncomment and install stripe package when ready:
// npm install stripe
// Add to .env.local:
//   STRIPE_SECRET_KEY=sk_test_...
//   STRIPE_WEBHOOK_SECRET=whsec_...
//   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

// POST /api/stripe - create a Stripe invoice from an internal invoice
export async function POST(req: NextRequest) {
  if (!STRIPE_SECRET_KEY) {
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

    // TODO: When Stripe is set up:
    // 1. Fetch the invoice from Supabase
    // 2. Find or create a Stripe customer (by client_email)
    // 3. Create Stripe invoice with line items
    // 4. Send the Stripe invoice
    // 5. Update the Supabase invoice with stripe_invoice_id
    // 6. Mark status as 'sent'

    // Example implementation (uncomment when stripe is installed):
    // const Stripe = (await import('stripe')).default
    // const stripe = new Stripe(STRIPE_SECRET_KEY)
    //
    // const { createClient } = await import('@/lib/supabase/server')
    // const supabase = await createClient()
    //
    // const { data: invoice } = await supabase
    //   .from('invoices')
    //   .select('*, jobs(*)')
    //   .eq('id', invoice_id)
    //   .single()
    //
    // // Find or create Stripe customer
    // const customers = await stripe.customers.list({ email: invoice.jobs.client_email, limit: 1 })
    // const customer = customers.data[0] || await stripe.customers.create({
    //   email: invoice.jobs.client_email,
    //   name: invoice.jobs.client_name,
    //   phone: invoice.jobs.client_phone,
    // })
    //
    // // Create Stripe invoice
    // const stripeInvoice = await stripe.invoices.create({
    //   customer: customer.id,
    //   collection_method: 'send_invoice',
    //   days_until_due: Math.ceil((new Date(invoice.due_date).getTime() - Date.now()) / 86400000),
    // })
    //
    // // Add line items
    // for (const item of invoice.line_items) {
    //   await stripe.invoiceItems.create({
    //     customer: customer.id,
    //     invoice: stripeInvoice.id,
    //     description: item.description,
    //     quantity: item.quantity,
    //     unit_amount: Math.round(item.unit_price * 100),
    //   })
    // }
    //
    // // Send the invoice
    // await stripe.invoices.sendInvoice(stripeInvoice.id)
    //
    // // Update our record
    // await supabase.from('invoices').update({
    //   stripe_invoice_id: stripeInvoice.id,
    //   status: 'sent',
    // }).eq('id', invoice_id)

    return NextResponse.json({
      message: 'Stripe integration scaffolded. Uncomment the code and install the stripe package to activate.',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
