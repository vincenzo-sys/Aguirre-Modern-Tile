import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// THE LEDGER (migration 053)
//
// job_payments is now the system of record for every non-Stripe-invoice
// payment. jobs.deposit_paid / final_payment_amount / amount_paid are
// PROJECTIONS of it, maintained by the job_payments_project trigger.
//
// recomputeJobFinancials (below) is therefore unchanged and still correct: it
// reads the projected columns, which are by construction the ledger's totals.
// It stays because the invoice-driven paths (webhook, PATCH, sync, void) change
// channel 1 without touching job_payments, and something has to fold that in.
// ─────────────────────────────────────────────────────────────────────────────

export const PAYMENT_METHODS = ['check', 'cash', 'zelle', 'venmo', 'stripe', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_KINDS = ['deposit', 'progress', 'final', 'payment', 'refund'] as const
export type PaymentKind = (typeof PAYMENT_KINDS)[number]

export type JobPayment = {
  id: string
  job_id: string
  amount: number | string
  method: PaymentMethod
  kind: PaymentKind
  paid_at: string
  reference: string | null
  note: string | null
  source: 'manual' | 'stripe_checkout' | 'backfill' | 'import'
  external_id: string | null
  recorded_by_profile_id: string | null
  voided_at: string | null
  voided_reason: string | null
  created_at: string
}

export type RecordPaymentInput = {
  amount: number
  method: PaymentMethod
  kind?: PaymentKind
  /** ISO instant or YYYY-MM-DD. Defaults to now. May be in the past. */
  paid_at?: string
  reference?: string | null
  note?: string | null
  /**
   * Whether recording this payment should also flip the job to 'paid'.
   * undefined = auto (only when the job has a real contract total AND the
   * payment covers it), true = force, false = never touch status.
   */
  mark_paid?: boolean
}

export type ValidatedPayment = {
  amount: number
  method: PaymentMethod
  kind: PaymentKind
  paid_at: string
  reference: string | null
  note: string | null
}

// Validation is a PURE function so it can be unit-tested without a database,
// matching how the rest of this codebase separates decisions from IO
// (completionInvoice.ts, googleReview.ts, stripeReconcile.ts).
export function validatePaymentInput(
  input: Partial<RecordPaymentInput>,
  now: Date
): { ok: true; value: ValidatedPayment } | { ok: false; error: string } {
  const amount = Math.round(Number(input.amount) * 100) / 100
  if (!Number.isFinite(amount) || amount === 0) {
    return { ok: false, error: 'amount must be a non-zero number' }
  }

  const method = input.method ?? 'check'
  if (!PAYMENT_METHODS.includes(method)) {
    return { ok: false, error: `method must be one of: ${PAYMENT_METHODS.join(', ')}` }
  }

  // Infer rather than demand: a negative amount is a refund, full stop. The DB
  // CHECK enforces the same pairing, so an explicit mismatch is a 400 here
  // rather than a 500 from Postgres.
  const kind: PaymentKind = input.kind ?? (amount < 0 ? 'refund' : 'payment')
  if (!PAYMENT_KINDS.includes(kind)) {
    return { ok: false, error: `kind must be one of: ${PAYMENT_KINDS.join(', ')}` }
  }
  if ((kind === 'refund') !== (amount < 0)) {
    return {
      ok: false,
      error: 'a refund must have a negative amount, and only a refund may be negative',
    }
  }

  // paid_at is the point of the whole table — but a FUTURE payment is always a
  // typo, and it would poison completionAnchor() for the review + reseal crons.
  let paid_at = now.toISOString()
  if (input.paid_at) {
    const raw = String(input.paid_at)
    // A bare YYYY-MM-DD from a date input means local noon, not UTC midnight —
    // otherwise "2026-06-19" renders as June 18 for anyone behind UTC.
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw)
    if (Number.isNaN(d.getTime())) return { ok: false, error: 'paid_at is not a valid date' }
    if (d.getTime() > now.getTime() + 86_400_000) {
      return { ok: false, error: 'paid_at cannot be in the future' }
    }
    paid_at = d.toISOString()
  }

  return {
    ok: true,
    value: {
      amount,
      method,
      kind,
      paid_at,
      reference: (input.reference ?? '').toString().trim() || null,
      note: (input.note ?? '').toString().trim() || null,
    },
  }
}

// Does recording this payment mean the job is fully paid?
//
// Fixes the bug in the old final-payment route, which computed
//   coversBalance = estimated > 0 ? paid >= estimated - 1 : true
// so a job with NO contract total was marked fully paid by ANY payment — the
// single most likely case for a $500 check on an unpriced GC job. An unknown
// total can never be "covered"; it can only be unknown.
export function shouldMarkPaid(opts: {
  amountPaid: number
  estimatedCost: number | null
  currentStatus: string
  markPaid?: boolean
}): boolean {
  const { amountPaid, estimatedCost, currentStatus, markPaid } = opts
  if (currentStatus === 'cancelled' || currentStatus === 'paid') return false
  if (markPaid === false) return false
  if (markPaid === true) return true
  const estimated = Number(estimatedCost ?? 0)
  if (!(estimated > 0)) return false
  return amountPaid >= estimated - 1 // $1 slop for rounding
}

/** Dollars, rounded to cents. Money is summed in floats here; this closes them. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function sumPayments(payments: Pick<JobPayment, 'amount' | 'voided_at'>[]): number {
  const total = payments
    .filter((p) => !p.voided_at)
    .reduce((sum, p) => sum + Number(p.amount), 0)
  return round2(total)
}

const KIND_LABEL: Record<PaymentKind, string> = {
  deposit: 'Deposit',
  progress: 'Progress payment',
  final: 'Final payment',
  payment: 'Payment',
  refund: 'Refund',
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  check: 'check',
  cash: 'cash',
  zelle: 'Zelle',
  venmo: 'Venmo',
  stripe: 'Stripe',
  other: 'other',
}

/**
 * One line of crew_log: `[Aug 24, 3:07 PM — Vince] <body>`.
 *
 * jobs.crew_log is a single free-text column that a human reads top-to-bottom,
 * so the stamp is load-bearing formatting, not decoration — five call sites
 * (payments, voids, the deposit gate, the crew route, the dashboard log widget)
 * all have to agree on it or the file stops reading chronologically. This is
 * that agreement. Lives here rather than in a UI module because the writers are
 * mostly server-side; the file's only import is `import type`, so a client
 * component can pull this in without dragging Supabase into the bundle.
 */
export function crewLogLine(authorName: string, now: Date, body: string): string {
  const stamp = now.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return `[${stamp} — ${authorName}] ${body}`
}

/** Newest-first, which is the order the log is read in. Blank history stays blank. */
export function prependCrewLog(existing: string | null | undefined, line: string): string {
  const prior = typeof existing === 'string' ? existing : ''
  return prior ? `${line}\n${prior}` : line
}

/** The crew_log line, matching the format the final-payment route already writes. */
export function paymentLogLine(
  p: ValidatedPayment,
  authorName: string,
  now: Date
): string {
  const when = p.paid_at.slice(0, 10)
  const bits = [p.reference, p.note].filter(Boolean).join(' — ')
  return crewLogLine(
    authorName,
    now,
    `${KIND_LABEL[p.kind]} recorded: ` +
      `$${Math.abs(p.amount).toFixed(2)} via ${METHOD_LABEL[p.method]} on ${when}` +
      (bits ? ` (${bits})` : '')
  )
}

// Single source of truth for a job's financial rollups.
//
// jobs.amount_paid is a ROLLING TOTAL across three DISJOINT payment channels:
//   1. Paid Stripe invoices  (invoices.status = 'paid', excluding voided)
//   2. The manual final payment (jobs.final_payment_amount) — cash/check/zelle,
//      recorded via /api/jobs/[id]/final-payment
//   3. The estimate deposit collected via Stripe Checkout (folded into
//      amount_paid by the checkout webhook)
//
// The invoice-driven recompute paths (webhook invoice.paid/voided, invoice
// PATCH, stripe sync, stripe void) historically set
//   amount_paid = SUM(paid invoices)
// which silently WIPED channels 2 and 3 for any job that mixed an invoice with
// a deposit or a manual final payment: e.g. a $10k job with a $1k deposit plus
// a $9k paid invoice would drop to amount_paid = 9000 and read as $1k still
// owed. Recomputing (rather than incrementing) is what makes these paths
// idempotent under Stripe webhook redelivery — but idempotent-by-recompute is
// only correct if it recomputes from ALL channels.
//
// This helper folds in channels 2 (final_payment_amount) and 3 (deposit_paid,
// added by migration 045) so a recompute can never wipe a deposit or a manual
// final payment. Both columns are disjoint from invoices, so summing them is a
// no-double-count reconstruction of the true amount_paid.
export async function recomputeJobFinancials(
  supabase: SupabaseClient,
  jobId: string
): Promise<{ amount_paid: number; amount_invoiced: number }> {
  const { data: jobInvoices } = await supabase
    .from('invoices')
    .select('amount, status')
    .eq('job_id', jobId)

  const active = (jobInvoices ?? []).filter(
    (inv: { status: string }) => inv.status !== 'void'
  )
  const invoicedPaid = active
    .filter((inv: { status: string }) => inv.status === 'paid')
    .reduce((sum: number, inv: { amount: number }) => sum + Number(inv.amount), 0)
  const amount_invoiced = active.reduce(
    (sum: number, inv: { amount: number }) => sum + Number(inv.amount),
    0
  )

  // final_payment_amount (migration 020) and deposit_paid (migration 045) are
  // real columns disjoint from invoices, so folding them in is a strict,
  // no-double-count reconstruction of the true amount_paid.
  const { data: job } = await supabase
    .from('jobs')
    .select('final_payment_amount, deposit_paid')
    .eq('id', jobId)
    .single()
  const finalPayment = Number(job?.final_payment_amount ?? 0)
  const depositPaid = Number(job?.deposit_paid ?? 0)

  const amount_paid = Math.round((invoicedPaid + finalPayment + depositPaid) * 100) / 100

  await supabase
    .from('jobs')
    .update({ amount_paid, amount_invoiced })
    .eq('id', jobId)

  return { amount_paid, amount_invoiced }
}

// ─────────────────────────────────────────────────────────────────────────────
// THE ONE WRITE PATH
// ─────────────────────────────────────────────────────────────────────────────

export type JobForPayment = {
  id: string
  status: string
  amount_paid: number | string | null
  estimated_cost: number | string | null
  crew_log: string | null
}

export type RecordPaymentResult = {
  payment: JobPayment | null
  /**
   * The jobs row as it stands after the write. Returned by the same UPDATE that
   * performs it, so callers rendering the updated job do not have to re-SELECT
   * a row the database just handed back.
   */
  job: Record<string, unknown> | null
  previous_amount_paid: number
  new_amount_paid: number
  next_status: string
  status_changed: boolean
  /** True when migration 053 is not applied yet and the legacy path was used. */
  degraded: boolean
}

// A Postgres/PostgREST error for "the table isn't there". Migration 040 sat
// unapplied for five months while its code was live, so "the migration might
// not be applied" is a load-bearing assumption in this repo, not paranoia.
function isMissingLedger(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  return (
    err.code === '42P01' ||
    err.code === 'PGRST205' ||
    /job_payments/i.test(err.message ?? '') &&
      /(does not exist|schema cache|could not find)/i.test(err.message ?? '')
  )
}

/**
 * Records one payment against a job and returns the resulting rollup.
 *
 * Both HTTP entry points (POST /api/jobs/[id]/payments and the legacy
 * POST /api/jobs/[id]/final-payment) call exactly this, so there is one place
 * where money enters the system and one place to reason about it.
 *
 * Deploy-safe ahead of migration 053: if job_payments is missing it falls back
 * to the legacy scalar channel and reports degraded=true.
 */
export async function recordJobPayment(
  supabase: SupabaseClient,
  job: JobForPayment,
  input: ValidatedPayment,
  ctx: { profileId: string | null; authorName: string; markPaid?: boolean; now?: Date }
): Promise<RecordPaymentResult> {
  const now = ctx.now ?? new Date()
  const previous_amount_paid = Number(job.amount_paid ?? 0)

  let payment: JobPayment | null = null
  let degraded = false

  const { data: inserted, error: insertErr } = await supabase
    .from('job_payments')
    .insert({
      job_id: job.id,
      amount: input.amount,
      method: input.method,
      kind: input.kind,
      paid_at: input.paid_at,
      reference: input.reference,
      note: input.note,
      source: 'manual',
      recorded_by_profile_id: ctx.profileId,
    })
    .select()
    .single()

  if (insertErr) {
    if (!isMissingLedger(insertErr)) throw new Error(insertErr.message)
    // Legacy path: bump the scalar channel atomically, exactly as before 053.
    degraded = true
    await supabase.rpc('increment_job_final_payment', {
      p_job_id: job.id,
      p_delta: input.amount,
    })
  } else {
    payment = inserted as JobPayment
  }

  // The 053 trigger already projected amount_paid. Recomputing is still right
  // (it is a recompute, not an increment, so it is idempotent) and it is what
  // keeps amount_invoiced fresh and the degraded path correct.
  const { amount_paid: new_amount_paid } = await recomputeJobFinancials(supabase, job.id)

  const flip = shouldMarkPaid({
    amountPaid: new_amount_paid,
    estimatedCost: job.estimated_cost === null ? null : Number(job.estimated_cost),
    currentStatus: job.status,
    markPaid: ctx.markPaid,
  })
  const next_status = flip ? 'paid' : job.status

  const logLine = paymentLogLine(input, ctx.authorName, now)

  // The singular final_payment_* columns are legacy metadata, but the dashboard
  // and InstallerJobCard still read final_payment_at for the "Payment received"
  // pill and as the primary completion anchor. Keep them pointing at the MOST
  // RECENT non-deposit payment so those readers stay honest — and never stamp
  // them from a deposit or a refund, which would date the job's completion to
  // the day the deal was signed.
  const updates: Record<string, unknown> = {
    status: next_status,
    crew_log: prependCrewLog(job.crew_log, logLine),
  }
  if (input.kind !== 'deposit' && input.kind !== 'refund') {
    updates.final_payment_at = input.paid_at
    updates.final_payment_method = input.method
    updates.final_payment_note = input.note
    updates.final_payment_by_profile_id = ctx.profileId
  }

  const { data: updatedJob, error: updateErr } = await supabase
    .from('jobs')
    .update(updates)
    .eq('id', job.id)
    .select()
    .single()
  if (updateErr) throw new Error(updateErr.message)

  return {
    payment,
    job: (updatedJob as Record<string, unknown> | null) ?? null,
    previous_amount_paid,
    new_amount_paid,
    next_status,
    status_changed: next_status !== job.status,
    degraded,
  }
}
