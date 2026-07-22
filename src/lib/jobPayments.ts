import type { SupabaseClient } from '@supabase/supabase-js'

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
