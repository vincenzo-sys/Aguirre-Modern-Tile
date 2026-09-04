import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireCronSecret } from '@/lib/apiAuth'
import { listAllStripe } from '@/lib/cron'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { postToDiscord, DISCORD_COLORS } from '@/lib/discord'
import {
  planStripeReconciliation,
  applyStripeReconciliation,
  summarizePlan,
  JOB_FIELDS_FOR_RECONCILE,
  INVOICE_FIELDS_FOR_RECONCILE,
  type StripeSessionInput,
  type StripeInvoiceInput,
} from '@/lib/stripeReconcile'
import type Stripe from 'stripe'

// Stripe -> CRM reconciliation backstop. Runs daily at 4:15 AM ET (08:15 UTC).
//
// The webhook is the fast path; this is the one that makes the money land
// EVENTUALLY no matter what. See the header of src/lib/stripeReconcile.ts for
// why an event-driven pipeline alone was not enough: the endpoint spent five
// months pointed at a host that 307s, every delivery failed, and Stripe's
// 3-day retry window closed on all of it. State-keyed reconciliation cannot
// have that failure mode — it re-reads the truth from Stripe every morning.
//
// Auth: Authorization: Bearer <CRON_SECRET>. Fails closed when unset.
// Preview: GET ...?dry_run=true — decides everything, writes nothing.
//
// Writes are narrow by construction: record_deposit (idempotent on the Stripe
// session id) and invoices.status -> 'paid', then recomputeJobFinancials. It
// never creates a job, never creates an invoice, and never contacts a customer.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const unauthorized = requireCronSecret(req)
  if (unauthorized) return unauthorized
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 })
  }

  const dryRun = req.nextUrl.searchParams.get('dry_run') === 'true'
  const stripe = getStripe()
  const supabase = createServiceClient()

  try {
    const [rawSessions, rawInvoices, rawCharges] = await Promise.all([
      listAllStripe<Stripe.Checkout.Session>((starting_after) =>
        stripe.checkout.sessions.list({ limit: 100, starting_after })
      ),
      listAllStripe<Stripe.Invoice>((starting_after) =>
        stripe.invoices.list({ limit: 100, starting_after })
      ),
      listAllStripe<Stripe.Charge>((starting_after) =>
        stripe.charges.list({ limit: 100, starting_after })
      ),
    ])

    // Refunds are tracked on the charge, not the session. Index by payment
    // intent so a refunded session can be held back from auto-crediting
    // instead of being credited at its gross amount.
    const refundedByIntent = new Map<string, number>()
    let accountRefundTotal = 0
    for (const charge of rawCharges) {
      const refunded = Number(charge.amount_refunded ?? 0) / 100
      if (refunded <= 0) continue
      accountRefundTotal += refunded
      const intent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
      if (!intent) continue
      refundedByIntent.set(intent, (refundedByIntent.get(intent) ?? 0) + refunded)
    }

    const sessions: StripeSessionInput[] = rawSessions.map((s) => {
      const intent = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id
      return {
        id: s.id,
        amount_total: (s.amount_total ?? 0) / 100,
        payment_status: s.payment_status,
        created: s.created,
        job_id: s.metadata?.job_id ?? null,
        type: s.metadata?.type ?? null,
        customer_email: s.customer_details?.email ?? null,
        amount_refunded: intent ? refundedByIntent.get(intent) ?? 0 : 0,
      }
    })

    const stripeInvoices: StripeInvoiceInput[] = rawInvoices.map((i) => ({
      id: i.id as string,
      status: i.status ?? null,
      amount_paid: Number(i.amount_paid ?? 0) / 100,
      amount_due: Number(i.amount_due ?? 0) / 100,
      number: i.number ?? null,
      customer_email: i.customer_email ?? null,
      created: i.created,
      hosted_invoice_url: i.hosted_invoice_url ?? null,
    }))

    const [{ data: jobs }, { data: localInvoices }, { data: ledger }] = await Promise.all([
      supabase.from('jobs').select(JOB_FIELDS_FOR_RECONCILE).limit(2000),
      supabase.from('invoices').select(INVOICE_FIELDS_FOR_RECONCILE).limit(2000),
      supabase.from('processed_deposit_sessions').select('session_id, job_id, amount').limit(2000),
    ])

    const plan = planStripeReconciliation({
      sessions,
      stripeInvoices,
      jobs: (jobs ?? []) as never,
      localInvoices: (localInvoices ?? []) as never,
      ledger: (ledger ?? []) as never,
      accountRefundTotal,
    })

    if (dryRun) {
      return NextResponse.json({ dry_run: true, summary: summarizePlan(plan), plan })
    }

    const applied = await applyStripeReconciliation(supabase, plan)

    // Only speak up when something actually moved or something is stuck.
    // A silent green run every morning trains you to ignore the channel.
    const newMoney = applied.credited.reduce((sum, d) => sum + d.amount, 0)
    if (applied.credited.length > 0 || applied.invoicesFixed.length > 0 || applied.errors.length > 0) {
      await postToDiscord({
        username: 'Stripe reconcile',
        embeds: [
          {
            title: applied.errors.length
              ? '⚠️ Stripe reconcile finished with errors'
              : `💵 Stripe reconcile credited $${newMoney.toFixed(2)} to job records`,
            color: applied.errors.length ? DISCORD_COLORS.red : DISCORD_COLORS.green,
            fields: [
              {
                name: 'Deposits credited',
                value: applied.credited.length
                  ? applied.credited
                      .map((d) => `#${d.job_number ?? '?'} ${d.client_name ?? ''} — $${d.amount.toFixed(2)}`)
                      .join('\n')
                      .slice(0, 1000)
                  : 'none',
              },
              {
                name: 'Invoices marked paid',
                value: applied.invoicesFixed.length
                  ? applied.invoicesFixed.map((f) => `${f.invoice_number ?? f.stripe_invoice_id} — $${f.amount.toFixed(2)}`).join('\n').slice(0, 1000)
                  : 'none',
              },
              {
                name: 'Unattributable (needs a human)',
                value: plan.orphans.length
                  ? `${plan.orphans.length} payment(s), $${plan.totals.unattributable.toFixed(2)}`
                  : 'none',
              },
              ...(applied.errors.length
                ? [{ name: 'Errors', value: applied.errors.map((e) => `${e.stripe_id}: ${e.message}`).join('\n').slice(0, 1000) }]
                : []),
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      }).catch((err) => console.error('Discord reconcile post failed:', err))
    }

    return NextResponse.json({
      dry_run: false,
      summary: summarizePlan(plan),
      credited: applied.credited,
      skipped: applied.skipped,
      invoices_fixed: applied.invoicesFixed,
      jobs_recomputed: applied.jobsRecomputed,
      errors: applied.errors,
      orphans: plan.orphans,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Stripe reconcile failed:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
