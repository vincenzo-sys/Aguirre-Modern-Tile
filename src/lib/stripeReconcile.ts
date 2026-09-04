import type { SupabaseClient } from '@supabase/supabase-js'
import { recomputeJobFinancials } from './jobPayments'

// Stripe -> CRM reconciliation.
//
// WHY THIS EXISTS:
// The webhook at /api/stripe/webhook is the fast path: a deposit lands, Stripe
// posts the event, record_deposit credits the job. Every piece of that pipeline
// is deployed and correct — and as of 2026-08-22 it had never run once. The
// Stripe endpoint was registered on the APEX host, which 307-redirects to www.
// Stripe does not follow redirects on webhook delivery, so 100% of events were
// recorded as failed: 21 paid Checkout sessions worth $11,502.18 all sat on
// jobs whose deposit_paid read $0.00, and processed_deposit_sessions was empty.
//
// Fixing the URL fixes the NEXT payment. It does not fix the last five months,
// because Stripe retries a failed webhook for ~3 days and then stops forever.
// There is no "redeliver everything" button for events that old.
//
// So the durable wiring is two-legged:
//   1. webhook  — credits within seconds of payment (the fast path)
//   2. this     — asks "what does Stripe say we were paid, and does every one
//                 of those dollars appear on a job row?" and repairs the gap
//
// Leg 2 is keyed on CURRENT STATE, not on events, so it heals any missed
// delivery — an expired endpoint, a deploy window, a 500, a rotated secret —
// without anyone noticing the miss. That is the same argument the
// completion-invoice cron makes for existing alongside its PATCH hook.
//
// SAFETY — the double-credit problem:
// Migration 045 backfilled deposit_paid for legacy jobs by RECONSTRUCTION:
//   deposit_paid = amount_paid - final_payment_amount - SUM(paid invoices)
// That number is not traceable to any Stripe object. If this reconciler credits
// a Stripe session on top of a reconstructed deposit, the job is paid twice on
// paper. Today the two sets are perfectly disjoint (every job with a paid
// session has deposit_paid = 0; every job with deposit_paid > 0 has no
// session), but "currently disjoint" is not a safety property. So the planner
// computes UNEXPLAINED deposit — deposit_paid minus the sessions already in the
// processed_deposit_sessions ledger — and refuses to auto-credit any job where
// that is non-zero. Those come back as needs_review with the numbers attached.
//
// Crediting itself is idempotent regardless: record_deposit dedupes on the
// Stripe session id (primary key), so a re-run is a no-op and a genuine SECOND
// deposit on the same job still credits.

export const RECONCILE_EPSILON = 0.01

export type StripeSessionInput = {
  id: string
  amount_total: number | null
  payment_status: string
  created: number
  job_id: string | null
  type: string | null
  customer_email: string | null
  /** Dollars refunded against this session's charge, if any. */
  amount_refunded?: number
}

export type StripeInvoiceInput = {
  id: string
  status: string | null
  amount_paid: number
  amount_due: number
  number: string | null
  customer_email: string | null
  created: number
  hosted_invoice_url?: string | null
}

export type ReconcileJob = {
  id: string
  job_number: number | null
  client_name: string | null
  status: string | null
  deposit_paid: number | null
  amount_paid: number | null
}

export type ReconcileInvoice = {
  id: string
  job_id: string
  invoice_number: string | null
  status: string
  amount: number
  stripe_invoice_id: string | null
}

export type LedgerEntry = {
  session_id: string
  job_id: string | null
  amount: number
}

export type DepositCredit = {
  session_id: string
  job_id: string
  job_number: number | null
  client_name: string | null
  amount: number
  created: number
}

export type InvoiceFix = {
  invoice_id: string
  job_id: string
  invoice_number: string | null
  stripe_invoice_id: string
  from_status: string
  to_status: string
  amount: number
}

export type OrphanReason =
  | 'session_missing_job_id'
  | 'session_job_not_found'
  | 'session_refunded'
  | 'job_has_unexplained_deposit'
  | 'stripe_invoice_not_in_crm'

export type Orphan = {
  reason: OrphanReason
  amount: number
  created: number
  /** Stripe object id — a session id or an invoice id. */
  stripe_id: string
  customer_email: string | null
  job_id: string | null
  detail: string
}

export type ReconcilePlan = {
  deposits: DepositCredit[]
  invoiceFixes: InvoiceFix[]
  orphans: Orphan[]
  alreadyCredited: number
  totals: {
    /** Paid Checkout-session dollars Stripe reports, all-time. */
    stripeSessionCash: number
    /** Paid Stripe-invoice dollars, all-time. */
    stripeInvoiceCash: number
    /** Dollars this run would newly land on job rows. */
    creditable: number
    /** Dollars Stripe took that no job row can claim. */
    unattributable: number
    /**
     * Account-level refunds this reconciliation does NOT subtract, in dollars.
     *
     * Checkout-session refunds ARE handled — those reach a session through its
     * payment intent, and a refunded session is held back as needs-review
     * rather than credited at gross. Refunds against a Stripe INVOICE are not,
     * because this account's API version (2026-02-25.clover) removed both
     * `charge.invoice` and `payment_intent.invoice`, leaving no reliable link
     * from a refund back to the invoice it reversed. Matching on amount + date
     * would be guessing at money, which is worse than a stated boundary.
     *
     * So the number is surfaced instead of silently ignored: if this is
     * non-zero, some invoice in the account was paid and then reversed, and the
     * gross figures above overstate net cash by up to this much. The durable
     * fix is a `charge.refunded` webhook handler that debits at the moment of
     * the refund, while the link is still on the event.
     */
    refundsNotModelled: number
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Pure planner. Decides what to credit, what to fix, and what nobody can
 * attribute — without touching the network or the database.
 *
 * `sessions` and `stripeInvoices` are the full Stripe history (dollars, not
 * cents). `ledger` is the current contents of processed_deposit_sessions.
 */
export function planStripeReconciliation(input: {
  sessions: StripeSessionInput[]
  stripeInvoices: StripeInvoiceInput[]
  jobs: ReconcileJob[]
  localInvoices: ReconcileInvoice[]
  ledger: LedgerEntry[]
  /** Total refunded dollars across the whole account, from the charges list.
   *  Session-linked refunds are subtracted out below; whatever remains is
   *  invoice-side and gets surfaced as totals.refundsNotModelled. */
  accountRefundTotal?: number
}): ReconcilePlan {
  const { sessions, stripeInvoices, jobs, localInvoices, ledger } = input

  const jobById = new Map(jobs.map((j) => [j.id, j]))
  const creditedSessionIds = new Set(ledger.map((e) => e.session_id))

  // Deposit dollars already explained by the ledger, per job. Anything in
  // jobs.deposit_paid beyond this came from somewhere untraceable (the 045
  // reconstruction, or a hand edit) and blocks auto-crediting that job.
  const ledgeredByJob = new Map<string, number>()
  for (const entry of ledger) {
    if (!entry.job_id) continue
    ledgeredByJob.set(entry.job_id, (ledgeredByJob.get(entry.job_id) ?? 0) + Number(entry.amount ?? 0))
  }

  const deposits: DepositCredit[] = []
  const orphans: Orphan[] = []
  let alreadyCredited = 0
  let stripeSessionCash = 0

  const paidSessions = sessions
    .filter((s) => s.payment_status === 'paid' && Number(s.amount_total ?? 0) > 0)
    .sort((a, b) => a.created - b.created)

  for (const session of paidSessions) {
    const amount = round2(Number(session.amount_total ?? 0))
    stripeSessionCash += amount

    if (creditedSessionIds.has(session.id)) {
      alreadyCredited += amount
      continue
    }

    // A partially/fully refunded session must never be credited at its gross
    // amount — that overstates what the customer actually paid. There is
    // exactly one refund in the account's history and it predates this code,
    // so rather than guess at net-of-refund arithmetic, hand it to a human.
    if (Number(session.amount_refunded ?? 0) > RECONCILE_EPSILON) {
      orphans.push({
        reason: 'session_refunded',
        amount,
        created: session.created,
        stripe_id: session.id,
        customer_email: session.customer_email,
        job_id: session.job_id,
        detail: `$${round2(Number(session.amount_refunded)).toFixed(2)} of this $${amount.toFixed(2)} payment was refunded — credit the net by hand.`,
      })
      continue
    }

    if (!session.job_id) {
      orphans.push({
        reason: 'session_missing_job_id',
        amount,
        created: session.created,
        stripe_id: session.id,
        customer_email: session.customer_email,
        job_id: null,
        detail:
          'Checkout session carries no job_id metadata (created outside the estimate-deposit flow). Match it to a job by customer email, then credit by hand.',
      })
      continue
    }

    const job = jobById.get(session.job_id)
    if (!job) {
      orphans.push({
        reason: 'session_job_not_found',
        amount,
        created: session.created,
        stripe_id: session.id,
        customer_email: session.customer_email,
        job_id: session.job_id,
        detail: `Session names job ${session.job_id}, which no longer exists (deleted or never created).`,
      })
      continue
    }

    const unexplained = round2(Number(job.deposit_paid ?? 0) - (ledgeredByJob.get(job.id) ?? 0))
    if (unexplained > RECONCILE_EPSILON) {
      orphans.push({
        reason: 'job_has_unexplained_deposit',
        amount,
        created: session.created,
        stripe_id: session.id,
        customer_email: session.customer_email,
        job_id: job.id,
        detail:
          `Job #${job.job_number ?? '?'} (${job.client_name ?? 'unknown'}) already shows $${unexplained.toFixed(2)} ` +
          `of deposit that no Stripe session explains. Crediting $${amount.toFixed(2)} on top would double-count it. ` +
          'Confirm which is real, then credit by hand.',
      })
      continue
    }

    deposits.push({
      session_id: session.id,
      job_id: job.id,
      job_number: job.job_number,
      client_name: job.client_name,
      amount,
      created: session.created,
    })
  }

  // ---- Stripe invoices ----
  const localByStripeId = new Map(
    localInvoices.filter((i) => i.stripe_invoice_id).map((i) => [i.stripe_invoice_id as string, i])
  )

  const invoiceFixes: InvoiceFix[] = []
  let stripeInvoiceCash = 0

  for (const si of stripeInvoices) {
    const paid = round2(Number(si.amount_paid ?? 0))
    if (si.status !== 'paid' || paid <= 0) continue
    stripeInvoiceCash += paid

    const local = localByStripeId.get(si.id)
    if (!local) {
      orphans.push({
        reason: 'stripe_invoice_not_in_crm',
        amount: paid,
        created: si.created,
        stripe_id: si.id,
        customer_email: si.customer_email,
        job_id: null,
        detail: `Stripe invoice ${si.number ?? si.id} was paid but has no row in the CRM invoices table, so it can never roll up to a job.`,
      })
      continue
    }

    if (local.status !== 'paid') {
      invoiceFixes.push({
        invoice_id: local.id,
        job_id: local.job_id,
        invoice_number: local.invoice_number,
        stripe_invoice_id: si.id,
        from_status: local.status,
        to_status: 'paid',
        amount: round2(Number(local.amount ?? 0)),
      })
    }
  }

  const creditable = round2(
    deposits.reduce((sum, d) => sum + d.amount, 0) +
      invoiceFixes.reduce((sum, f) => sum + f.amount, 0)
  )
  const unattributable = round2(orphans.reduce((sum, o) => sum + o.amount, 0))

  // Refunds we DID account for: those reachable from a Checkout session.
  // Whatever the account reports beyond that is invoice-side and unlinkable —
  // report it rather than pretend gross equals net.
  const sessionRefunds = sessions.reduce((sum, s) => sum + Number(s.amount_refunded ?? 0), 0)
  const refundsNotModelled = Math.max(
    0,
    round2(Number(input.accountRefundTotal ?? 0) - sessionRefunds)
  )

  return {
    deposits,
    invoiceFixes,
    orphans,
    alreadyCredited: round2(alreadyCredited),
    totals: {
      stripeSessionCash: round2(stripeSessionCash),
      stripeInvoiceCash: round2(stripeInvoiceCash),
      creditable,
      unattributable,
      refundsNotModelled,
    },
  }
}

export type ApplyResult = {
  credited: DepositCredit[]
  skipped: Array<{ session_id: string; reason: string }>
  invoicesFixed: InvoiceFix[]
  errors: Array<{ stripe_id: string; message: string }>
  jobsRecomputed: string[]
}

/**
 * Executes a plan. Safe to re-run: record_deposit dedupes on the Stripe session
 * id, and recomputeJobFinancials rebuilds amount_paid from all three channels
 * rather than incrementing it.
 */
export async function applyStripeReconciliation(
  supabase: SupabaseClient,
  plan: ReconcilePlan
): Promise<ApplyResult> {
  const result: ApplyResult = {
    credited: [],
    skipped: [],
    invoicesFixed: [],
    errors: [],
    jobsRecomputed: [],
  }
  const touchedJobs = new Set<string>()

  for (const deposit of plan.deposits) {
    const { data: credited, error } = await supabase.rpc('record_deposit', {
      p_session_id: deposit.session_id,
      p_job_id: deposit.job_id,
      p_amount: deposit.amount,
    })

    if (error) {
      result.errors.push({
        stripe_id: deposit.session_id,
        message: (error as { message?: string }).message ?? 'record_deposit failed',
      })
      continue
    }

    if (credited === false) {
      // Another run (or the webhook, now that it works) got there first.
      result.skipped.push({ session_id: deposit.session_id, reason: 'already_credited' })
    } else {
      result.credited.push(deposit)
    }
    // Recompute either way: a prior run may have credited but died before
    // rolling the total up to amount_paid.
    touchedJobs.add(deposit.job_id)
  }

  for (const fix of plan.invoiceFixes) {
    const { error } = await supabase
      .from('invoices')
      .update({ status: fix.to_status })
      .eq('id', fix.invoice_id)

    if (error) {
      result.errors.push({
        stripe_id: fix.stripe_invoice_id,
        message: (error as { message?: string }).message ?? 'invoice status update failed',
      })
      continue
    }
    result.invoicesFixed.push(fix)
    touchedJobs.add(fix.job_id)
  }

  // Each job's recompute reads and writes only its own row, so these are
  // independent and run concurrently rather than three round-trips deep, one
  // job after another. This has to stay AFTER the record_deposit loop above:
  // the migration-053 trigger rewrites deposit_paid, and recomputing before it
  // has finished would fold in a stale deposit.
  //
  // Results are drained in the original iteration order so the Discord digest
  // and the JSON response stay deterministic run to run.
  const recomputes = await Promise.all(
    [...touchedJobs].map(async (jobId) => {
      try {
        await recomputeJobFinancials(supabase, jobId)
        return { jobId, message: null as string | null }
      } catch (err) {
        return {
          jobId,
          message: err instanceof Error ? err.message : 'recomputeJobFinancials failed',
        }
      }
    })
  )
  for (const r of recomputes) {
    if (r.message) result.errors.push({ stripe_id: r.jobId, message: r.message })
    else result.jobsRecomputed.push(r.jobId)
  }

  return result
}

/** Columns the planner needs off the jobs table. */
export const JOB_FIELDS_FOR_RECONCILE =
  'id, job_number, client_name, status, deposit_paid, amount_paid'

/** Columns the planner needs off the invoices table. Deliberately avoids
 *  public_token / stripe_hosted_url / sent_at — those live in migrations that
 *  are written but not yet applied to production, and this reconciler has to
 *  run against the database as it actually is today. */
export const INVOICE_FIELDS_FOR_RECONCILE =
  'id, job_id, invoice_number, status, amount, stripe_invoice_id'

/**
 * One-line human summary for Discord / CLI / cron response.
 */
export function summarizePlan(plan: ReconcilePlan): string {
  const { totals } = plan
  const refundNote =
    totals.refundsNotModelled > RECONCILE_EPSILON
      ? `, $${totals.refundsNotModelled.toFixed(2)} in invoice refunds NOT subtracted`
      : ''
  return (
    `Stripe cash: $${(totals.stripeSessionCash + totals.stripeInvoiceCash).toFixed(2)} ` +
    `(${plan.deposits.length} deposit${plan.deposits.length === 1 ? '' : 's'} to credit = $${totals.creditable.toFixed(2)}, ` +
    `${plan.orphans.length} unattributable = $${totals.unattributable.toFixed(2)}, ` +
    `$${plan.alreadyCredited.toFixed(2)} already on job rows${refundNote})`
  )
}
