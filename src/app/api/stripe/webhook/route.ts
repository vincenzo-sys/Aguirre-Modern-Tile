import { NextRequest, NextResponse } from 'next/server'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/service'
import { updateNotionJobPayment } from '@/lib/notion'
import { sendSMS } from '@/lib/openphone'
import { Resend } from 'resend'
import type Stripe from 'stripe'

// Stripe sends raw body — we need to disable Next.js body parsing
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 })
  }

  const stripe = getStripe()
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature'
    console.error('Webhook signature verification failed:', message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'invoice.paid': {
        const stripeInvoice = event.data.object as Stripe.Invoice
        await handleInvoicePaid(stripeInvoice)
        break
      }
      case 'invoice.payment_failed': {
        const stripeInvoice = event.data.object as Stripe.Invoice
        await handlePaymentFailed(stripeInvoice)
        break
      }
      case 'invoice.overdue': {
        const stripeInvoice = event.data.object as Stripe.Invoice
        await handleInvoiceOverdue(stripeInvoice)
        break
      }
      case 'invoice.voided': {
        const stripeInvoice = event.data.object as Stripe.Invoice
        await handleInvoiceVoided(stripeInvoice)
        break
      }
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        await handleCheckoutCompleted(session)
        break
      }
      default:
        // Unhandled event type — acknowledge receipt
        break
    }
  } catch (err) {
    console.error(`Error handling ${event.type}:`, err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Only handle estimate-deposit checkout sessions
  if (session.metadata?.type !== 'estimate_deposit') return
  if (session.payment_status !== 'paid') return

  const jobId = session.metadata.job_id
  if (!jobId) {
    console.warn('Estimate deposit checkout completed without job_id metadata')
    return
  }

  const depositDollars = Number(session.amount_total ?? 0) / 100
  if (depositDollars <= 0) return

  const supabase = createServiceClient()

  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, client_name, status, scheduled_start, amount_paid, estimated_cost')
    .eq('id', jobId)
    .single()

  if (!job) {
    console.warn(`Received estimate deposit for unknown job ${jobId}`)
    return
  }

  const newAmountPaid = Number(job.amount_paid ?? 0) + depositDollars
  const updates: Record<string, unknown> = {
    amount_paid: newAmountPaid,
    estimate_accepted_at: new Date().toISOString(),
  }

  // If the job already has a start date, flip status to 'scheduled' so it
  // reaches Christian's view. Otherwise stay in current state — owner picks
  // a date next and can advance manually.
  if (job.scheduled_start && (job.status === 'lead' || job.status === 'quoted')) {
    updates.status = 'scheduled'
  } else if (job.status === 'lead') {
    updates.status = 'quoted'
  }

  await supabase.from('jobs').update(updates).eq('id', jobId)

  console.log(
    `Estimate deposit $${depositDollars} recorded for job ${jobId} (session ${session.id})`
  )

  // Fire-and-forget owner notifications so Vince knows the moment it lands
  const dollars = `$${Math.round(depositDollars).toLocaleString()}`
  const summary = `Deposit ${dollars} from ${job.client_name} for "${job.title}" received.`

  if (process.env.OPENPHONE_API_KEY && process.env.OWNER_PHONE) {
    sendSMS(process.env.OWNER_PHONE, summary).catch((err) =>
      console.error('Owner SMS notification failed:', err)
    )
  }

  if (process.env.RESEND_API_KEY) {
    const fromEmail =
      process.env.RESEND_FROM_EMAIL || 'Aguirre Modern Tile <onboarding@resend.dev>'
    const toEmail = process.env.CONTACT_FORM_TO_EMAIL || 'vin@moderntile.pro'
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      resend.emails
        .send({
          from: fromEmail,
          to: toEmail,
          subject: `Deposit received: ${dollars} from ${job.client_name}`,
          html: `
            <h2>Deposit received</h2>
            <p><strong>${job.client_name}</strong> just accepted the estimate for
            <strong>${job.title}</strong> and paid a deposit of <strong>${dollars}</strong>.</p>
            <ul>
              <li>Job total: $${Number(job.estimated_cost ?? 0).toLocaleString()}</li>
              <li>Balance remaining: $${Math.max(0, Number(job.estimated_cost ?? 0) - newAmountPaid).toLocaleString()}</li>
              <li>Status: ${updates.status ?? job.status}</li>
            </ul>
            <p><a href="${process.env.NEXT_PUBLIC_SITE_URL || ''}/dashboard/jobs/${jobId}">Open job →</a></p>
          `,
        })
        .catch((err) => console.error('Owner email notification failed:', err))
    } catch (err) {
      console.error('Owner email notification failed:', err)
    }
  }
}

async function handleInvoicePaid(stripeInvoice: Stripe.Invoice) {
  const supabase = createServiceClient()
  const stripeInvoiceId = stripeInvoice.id

  // Find our local invoice by stripe_invoice_id
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('stripe_invoice_id', stripeInvoiceId)
    .single()

  if (error || !invoice) {
    console.warn('Received payment for unknown Stripe invoice:', stripeInvoiceId)
    return
  }

  // Mark invoice as paid
  await supabase
    .from('invoices')
    .update({ status: 'paid' })
    .eq('id', invoice.id)

  // Update the job's amount_paid (sum all paid invoices for this job)
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

  // Sync payment to Notion if the job has a notion_page_id
  if (process.env.NOTION_API_TOKEN) {
    const { data: job } = await supabase
      .from('jobs')
      .select('notion_page_id')
      .eq('id', invoice.job_id)
      .single()

    if (job?.notion_page_id) {
      updateNotionJobPayment(job.notion_page_id, totalPaid).catch((err) => {
        console.error('Failed to sync payment to Notion:', err)
      })
    }
  }

  console.log(`Invoice ${invoice.invoice_number} marked as paid via Stripe webhook`)
}

async function handlePaymentFailed(stripeInvoice: Stripe.Invoice) {
  const supabase = createServiceClient()
  const stripeInvoiceId = stripeInvoice.id

  const { data: invoice } = await supabase
    .from('invoices')
    .select('invoice_number, status')
    .eq('stripe_invoice_id', stripeInvoiceId)
    .single()

  if (invoice) {
    // Keep status as 'sent' — Stripe will retry automatically.
    // Only log for visibility; don't change status to avoid confusing the retry flow.
    console.warn(
      `Payment failed for invoice ${invoice.invoice_number} (Stripe: ${stripeInvoiceId}). ` +
      `Current local status: ${invoice.status}. Stripe will retry.`
    )
  }
}

async function handleInvoiceOverdue(stripeInvoice: Stripe.Invoice) {
  const supabase = createServiceClient()
  const stripeInvoiceId = stripeInvoice.id

  // Mark our local invoice as overdue
  await supabase
    .from('invoices')
    .update({ status: 'overdue' })
    .eq('stripe_invoice_id', stripeInvoiceId)

  console.log(`Invoice marked as overdue via Stripe webhook (Stripe: ${stripeInvoiceId})`)
}

async function handleInvoiceVoided(stripeInvoice: Stripe.Invoice) {
  const supabase = createServiceClient()
  const stripeInvoiceId = stripeInvoice.id

  // Find local invoice
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, invoice_number, job_id, status')
    .eq('stripe_invoice_id', stripeInvoiceId)
    .single()

  if (!invoice) {
    console.warn('Received voided event for unknown Stripe invoice:', stripeInvoiceId)
    return
  }

  // Mark as void
  await supabase
    .from('invoices')
    .update({ status: 'void' })
    .eq('id', invoice.id)

  // Recalculate job.amount_invoiced excluding voided invoices
  const { data: jobInvoices } = await supabase
    .from('invoices')
    .select('amount, status')
    .eq('job_id', invoice.job_id)

  const totalInvoiced = (jobInvoices ?? [])
    .filter((inv: { status: string }) => inv.status !== 'void')
    .reduce((sum: number, inv: { amount: number }) => sum + Number(inv.amount), 0)

  await supabase
    .from('jobs')
    .update({ amount_invoiced: totalInvoiced })
    .eq('id', invoice.job_id)

  console.log(`Invoice ${invoice.invoice_number} marked as void via Stripe webhook`)
}
