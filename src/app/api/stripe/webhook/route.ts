import { NextRequest, NextResponse } from 'next/server'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/service'
import { updateNotionJobPayment } from '@/lib/notion'
import { sendSMS, toE164, AUTO_MESSAGES } from '@/lib/openphone'
import { sendCustomerEmail } from '@/lib/email'
import { postToDiscord, DISCORD_COLORS } from '@/lib/discord'
import { deriveScheduledEnd } from '@/lib/jobScheduling'
import { Resend } from 'resend'
import type Stripe from 'stripe'

// Fire a red Discord alert when Stripe took money but the dashboard
// can't attribute it. These are the three known orphan paths:
//   - estimate deposit checkout with no job_id in metadata
//   - estimate deposit for a job_id that doesn't match any row
//   - invoice.paid for a stripe_invoice_id we have no local row for
// Each represents real revenue we're not tracking — Vince needs to
// hear about it inside seconds, not when he scrolls Vercel logs.
function alertOrphanPayment(reason: string, fields: Array<{ name: string; value: string }>) {
  return postToDiscord({
    username: 'Stripe orphan',
    embeds: [
      {
        title: `⚠️ Stripe payment orphaned: ${reason}`,
        description:
          'Stripe took money but the dashboard could not attribute it to a job/invoice. Reconcile manually in Stripe.',
        color: DISCORD_COLORS.red,
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
  }).catch((err) => console.error('Discord orphan alert failed:', err))
}

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
    await alertOrphanPayment('deposit checkout missing job_id metadata', [
      { name: 'Stripe session', value: session.id },
      { name: 'Amount', value: `$${(Number(session.amount_total ?? 0) / 100).toFixed(2)}` },
      { name: 'Customer email', value: session.customer_details?.email ?? '(none on session)' },
    ])
    return
  }

  const depositDollars = Number(session.amount_total ?? 0) / 100
  if (depositDollars <= 0) return

  const supabase = createServiceClient()

  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, client_name, client_email, client_phone, status, scheduled_start, scheduled_end, estimated_days, amount_paid, estimated_cost, estimate_accepted_at, estimate_token')
    .eq('id', jobId)
    .single()

  if (!job) {
    console.warn(`Received estimate deposit for unknown job ${jobId}`)
    await alertOrphanPayment('deposit for job that does not exist', [
      { name: 'Job ID (claimed)', value: jobId },
      { name: 'Stripe session', value: session.id },
      { name: 'Amount', value: `$${depositDollars.toFixed(2)}` },
      { name: 'Customer email', value: session.customer_details?.email ?? '(none on session)' },
    ])
    return
  }

  // Idempotency: Stripe can redeliver the same event up to 3 days later. If
  // estimate_accepted_at is already set, this webhook already ran for this
  // job and we should not double-credit amount_paid. The first delivery
  // remains canonical; subsequent redeliveries are no-ops.
  if (job.estimate_accepted_at) {
    console.log(
      `Skipping duplicate deposit webhook for job ${jobId} (already accepted at ${job.estimate_accepted_at}, session ${session.id})`
    )
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

  // Auto-fill scheduled_end so the calendar block spans the full install.
  // Only fires when start is set, end is empty, and estimated_days > 0 —
  // never overwrites a hand-typed end date.
  const autoEnd = deriveScheduledEnd(
    job.scheduled_start,
    job.estimated_days,
    job.scheduled_end,
  )
  if (autoEnd) {
    updates.scheduled_end = autoEnd
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

  // Customer-side confirmation — closes the loop on payment so they don't
  // wonder "did it go through?" Email is the receipt; SMS is the
  // immediate "we got it" so they can stop staring at the page.
  sendDepositConfirmation({
    email: job.client_email,
    phone: job.client_phone,
    firstName: (job.client_name || '').split(' ')[0] || '',
    title: job.title,
    depositDollars,
    estimateToken: job.estimate_token,
  }).catch((err) => console.error('customer deposit confirmation failed:', err))
}

async function sendDepositConfirmation({
  email,
  phone,
  firstName,
  title,
  depositDollars,
  estimateToken,
}: {
  email: string | null
  phone: string | null
  firstName: string
  title: string
  depositDollars: number
  estimateToken: string | null
}) {
  const amountStr = Math.round(depositDollars).toLocaleString()

  if (phone) {
    const e164 = toE164(phone)
    if (e164) {
      await sendSMS(e164, AUTO_MESSAGES.deposit_received(firstName, amountStr)).catch(
        (err) => console.error('deposit_received SMS failed:', err)
      )
    }
  }

  if (email) {
    const greeting = firstName ? `Hi ${firstName},` : 'Hi there,'
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || ''
    const estimateUrl = estimateToken ? `${baseUrl}/estimates/${estimateToken}` : null
    const dateStr = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">
        <p style="font-size: 16px; margin: 0 0 12px 0;">${greeting}</p>
        <p style="font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">
          We received your <strong>$${amountStr} deposit</strong> for <strong>${title}</strong> on ${dateStr}. Thank you!
        </p>
        <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:16px 18px; margin: 0 0 20px 0;">
          <p style="font-size: 14px; color:#075985; font-weight:600; margin: 0 0 6px 0;">What happens next</p>
          <p style="font-size: 14px; color:#0c4a6e; margin: 0 0 4px 0;">1. I'll be in touch within 24 hours to confirm your install schedule.</p>
          <p style="font-size: 14px; color:#0c4a6e; margin: 0 0 4px 0;">2. We finalize the start date — you pick what works for your week.</p>
          <p style="font-size: 14px; color:#0c4a6e; margin: 0;">3. Crew arrives ready: full team, all materials, jobsite protected.</p>
        </div>
        ${estimateUrl ? `<p style="font-size: 14px; line-height: 1.5; margin: 0 0 16px 0; color:#374151;">You can review your estimate any time at <a href="${estimateUrl}" style="color:#0284c7;">${estimateUrl}</a>.</p>` : ''}
        <p style="font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">
          Questions? Reply to this email or text me at
          <a href="tel:+16177661259" style="color:#0284c7;">(617) 766-1259</a>.
        </p>
        <p style="font-size: 16px; margin: 24px 0 4px 0;">— Vince</p>
        <p style="font-size: 13px; color: #6b7280; margin: 0;">Aguirre Modern Tile · Greater Boston</p>
      </div>
    `.trim()
    await sendCustomerEmail({
      to: email,
      subject: `Deposit received — $${amountStr} for ${title}`,
      html,
      replyTo: process.env.CONTACT_FORM_TO_EMAIL || 'vin@moderntile.pro',
    }).catch((err) => console.error('deposit_received email failed:', err))
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
    await alertOrphanPayment('payment for invoice not in dashboard', [
      { name: 'Stripe invoice ID', value: stripeInvoiceId ?? '(no id)' },
      {
        name: 'Amount paid',
        value: `$${(Number(stripeInvoice.amount_paid ?? 0) / 100).toFixed(2)}`,
      },
      {
        name: 'Customer email',
        value: stripeInvoice.customer_email ?? '(none on invoice)',
      },
      { name: 'Hosted URL', value: stripeInvoice.hosted_invoice_url ?? '(none)' },
    ])
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
