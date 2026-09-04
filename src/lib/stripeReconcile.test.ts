import { describe, it, expect } from 'vitest'
import {
  planStripeReconciliation,
  summarizePlan,
  type StripeSessionInput,
  type StripeInvoiceInput,
  type ReconcileJob,
  type ReconcileInvoice,
  type LedgerEntry,
} from './stripeReconcile'

const T = 1_750_000_000

function session(overrides: Partial<StripeSessionInput> = {}): StripeSessionInput {
  return {
    id: 'cs_1',
    amount_total: 500,
    payment_status: 'paid',
    created: T,
    job_id: 'job-1',
    type: 'estimate_deposit',
    customer_email: 'a@example.com',
    amount_refunded: 0,
    ...overrides,
  }
}

function job(overrides: Partial<ReconcileJob> = {}): ReconcileJob {
  return {
    id: 'job-1',
    job_number: 91,
    client_name: 'Taylor Milsal',
    status: 'scheduled',
    deposit_paid: 0,
    amount_paid: 0,
    ...overrides,
  }
}

function stripeInvoice(overrides: Partial<StripeInvoiceInput> = {}): StripeInvoiceInput {
  return {
    id: 'in_1',
    status: 'paid',
    amount_paid: 1000,
    amount_due: 1000,
    number: 'ABC-0001',
    customer_email: 'a@example.com',
    created: T,
    ...overrides,
  }
}

function localInvoice(overrides: Partial<ReconcileInvoice> = {}): ReconcileInvoice {
  return {
    id: 'inv-local-1',
    job_id: 'job-1',
    invoice_number: 'INV-2026-001',
    status: 'sent',
    amount: 1000,
    stripe_invoice_id: 'in_1',
    ...overrides,
  }
}

function plan(input: {
  sessions?: StripeSessionInput[]
  stripeInvoices?: StripeInvoiceInput[]
  jobs?: ReconcileJob[]
  localInvoices?: ReconcileInvoice[]
  ledger?: LedgerEntry[]
  accountRefundTotal?: number
}) {
  return planStripeReconciliation({
    sessions: input.sessions ?? [],
    stripeInvoices: input.stripeInvoices ?? [],
    jobs: input.jobs ?? [],
    localInvoices: input.localInvoices ?? [],
    ledger: input.ledger ?? [],
    accountRefundTotal: input.accountRefundTotal,
  })
}

describe('planStripeReconciliation — deposits', () => {
  it('credits a paid session whose job exists and has no unexplained deposit', () => {
    const p = plan({ sessions: [session()], jobs: [job()] })
    expect(p.deposits).toHaveLength(1)
    expect(p.deposits[0]).toMatchObject({ session_id: 'cs_1', job_id: 'job-1', amount: 500 })
    expect(p.orphans).toHaveLength(0)
    expect(p.totals.creditable).toBe(500)
  })

  it('ignores unpaid and zero-amount sessions', () => {
    const p = plan({
      sessions: [
        session({ id: 'cs_unpaid', payment_status: 'unpaid' }),
        session({ id: 'cs_zero', amount_total: 0 }),
      ],
      jobs: [job()],
    })
    expect(p.deposits).toHaveLength(0)
    expect(p.totals.stripeSessionCash).toBe(0)
  })

  it('credits a genuine SECOND deposit on the same job once the first is ledgered', () => {
    // Job #73 in production really did pay twice (2026-06-29 and 2026-07-01).
    const p = plan({
      sessions: [session({ id: 'cs_a' }), session({ id: 'cs_b', created: T + 100 })],
      jobs: [job({ deposit_paid: 500 })],
      ledger: [{ session_id: 'cs_a', job_id: 'job-1', amount: 500 }],
    })
    expect(p.alreadyCredited).toBe(500)
    expect(p.deposits.map((d) => d.session_id)).toEqual(['cs_b'])
    expect(p.orphans).toHaveLength(0)
  })

  it('is a no-op once every session is ledgered', () => {
    const p = plan({
      sessions: [session()],
      jobs: [job({ deposit_paid: 500, amount_paid: 500 })],
      ledger: [{ session_id: 'cs_1', job_id: 'job-1', amount: 500 }],
    })
    expect(p.deposits).toHaveLength(0)
    expect(p.alreadyCredited).toBe(500)
    expect(p.totals.creditable).toBe(0)
  })
})

describe('planStripeReconciliation — double-credit guard', () => {
  it('refuses to credit a job carrying deposit dollars no session explains', () => {
    // Migration 045 reconstructed deposit_paid by subtraction for legacy jobs.
    // Crediting a Stripe session on top of that pays the job twice on paper.
    const p = plan({
      sessions: [session()],
      jobs: [job({ deposit_paid: 350, amount_paid: 350 })],
      ledger: [],
    })
    expect(p.deposits).toHaveLength(0)
    expect(p.orphans).toHaveLength(1)
    expect(p.orphans[0].reason).toBe('job_has_unexplained_deposit')
    expect(p.orphans[0].detail).toContain('350.00')
    expect(p.totals.unattributable).toBe(500)
  })

  it('allows crediting when deposit_paid is fully explained by the ledger', () => {
    const p = plan({
      sessions: [session({ id: 'cs_a' }), session({ id: 'cs_b' })],
      jobs: [job({ deposit_paid: 500 })],
      ledger: [{ session_id: 'cs_a', job_id: 'job-1', amount: 500 }],
    })
    expect(p.deposits.map((d) => d.session_id)).toEqual(['cs_b'])
  })

  it('tolerates sub-cent float drift rather than flagging it', () => {
    const p = plan({
      sessions: [session({ id: 'cs_b' })],
      jobs: [job({ deposit_paid: 500.004 })],
      ledger: [{ session_id: 'cs_a', job_id: 'job-1', amount: 500 }],
    })
    expect(p.deposits).toHaveLength(1)
  })
})

describe('planStripeReconciliation — orphans', () => {
  it('flags a paid session with no job_id metadata', () => {
    const p = plan({ sessions: [session({ job_id: null, type: null })], jobs: [job()] })
    expect(p.deposits).toHaveLength(0)
    expect(p.orphans[0].reason).toBe('session_missing_job_id')
    expect(p.orphans[0].customer_email).toBe('a@example.com')
  })

  it('flags a paid session pointing at a job that no longer exists', () => {
    const p = plan({ sessions: [session({ job_id: 'ghost' })], jobs: [job()] })
    expect(p.orphans[0].reason).toBe('session_job_not_found')
    expect(p.orphans[0].job_id).toBe('ghost')
  })

  it('never auto-credits a refunded session at its gross amount', () => {
    const p = plan({ sessions: [session({ amount_refunded: 228 })], jobs: [job()] })
    expect(p.deposits).toHaveLength(0)
    expect(p.orphans[0].reason).toBe('session_refunded')
    expect(p.orphans[0].detail).toContain('228.00')
  })
})

describe('planStripeReconciliation — invoices', () => {
  it('flips a locally-unpaid invoice that Stripe reports as paid', () => {
    const p = plan({ stripeInvoices: [stripeInvoice()], localInvoices: [localInvoice()] })
    expect(p.invoiceFixes).toHaveLength(1)
    expect(p.invoiceFixes[0]).toMatchObject({
      invoice_id: 'inv-local-1',
      job_id: 'job-1',
      from_status: 'sent',
      to_status: 'paid',
      amount: 1000,
    })
    expect(p.totals.creditable).toBe(1000)
  })

  it('leaves an already-paid invoice alone', () => {
    const p = plan({
      stripeInvoices: [stripeInvoice()],
      localInvoices: [localInvoice({ status: 'paid' })],
    })
    expect(p.invoiceFixes).toHaveLength(0)
  })

  it('ignores open and void Stripe invoices', () => {
    const p = plan({
      stripeInvoices: [
        stripeInvoice({ id: 'in_open', status: 'open', amount_paid: 0 }),
        stripeInvoice({ id: 'in_void', status: 'void', amount_paid: 0 }),
      ],
      localInvoices: [localInvoice({ stripe_invoice_id: 'in_open' })],
    })
    expect(p.invoiceFixes).toHaveLength(0)
    expect(p.totals.stripeInvoiceCash).toBe(0)
  })

  it('flags a paid Stripe invoice with no CRM row at all', () => {
    const p = plan({ stripeInvoices: [stripeInvoice()], localInvoices: [] })
    expect(p.orphans[0].reason).toBe('stripe_invoice_not_in_crm')
    expect(p.orphans[0].amount).toBe(1000)
  })
})

describe('totals', () => {
  it('accounts for every paid dollar as creditable, already-credited, or unattributable', () => {
    const p = plan({
      sessions: [
        session({ id: 'cs_ok', amount_total: 100 }),
        session({ id: 'cs_done', amount_total: 200 }),
        session({ id: 'cs_orphan', amount_total: 300, job_id: null }),
      ],
      stripeInvoices: [stripeInvoice({ amount_paid: 1000 })],
      jobs: [job({ deposit_paid: 200 })],
      localInvoices: [localInvoice()],
      ledger: [{ session_id: 'cs_done', job_id: 'job-1', amount: 200 }],
    })

    expect(p.totals.stripeSessionCash).toBe(600)
    expect(p.totals.stripeInvoiceCash).toBe(1000)
    // 100 (session) + 1000 (invoice flipped to paid)
    expect(p.totals.creditable).toBe(1100)
    expect(p.alreadyCredited).toBe(200)
    expect(p.totals.unattributable).toBe(300)
    // Every paid dollar is in exactly one bucket.
    expect(p.totals.creditable + p.alreadyCredited + p.totals.unattributable).toBe(
      p.totals.stripeSessionCash + p.totals.stripeInvoiceCash
    )
  })

  it('summarizes in one line', () => {
    const p = plan({ sessions: [session()], jobs: [job()] })
    expect(summarizePlan(p)).toContain('1 deposit to credit = $500.00')
  })
})

describe('refunds not modelled', () => {
  it('is zero when the account has no refunds', () => {
    const p = plan({ sessions: [session()], jobs: [job()], accountRefundTotal: 0 })
    expect(p.totals.refundsNotModelled).toBe(0)
    expect(summarizePlan(p)).not.toContain('NOT subtracted')
  })

  it('does not double-count a refund already attributed to a session', () => {
    // The session-level refund IS handled (held back as needs-review), so it
    // must not also show up as an unmodelled invoice refund.
    const p = plan({
      sessions: [session({ amount_refunded: 228 })],
      jobs: [job()],
      accountRefundTotal: 228,
    })
    expect(p.orphans[0].reason).toBe('session_refunded')
    expect(p.totals.refundsNotModelled).toBe(0)
  })

  it('surfaces an invoice-side refund that no session explains', () => {
    // The real 2026-03-31 case: $228 refunded against an invoice charge, with
    // no charge->invoice link available on this API version.
    const p = plan({ sessions: [session()], jobs: [job()], accountRefundTotal: 228 })
    expect(p.totals.refundsNotModelled).toBe(228)
    expect(summarizePlan(p)).toContain('$228.00 in invoice refunds NOT subtracted')
  })

  it('never reports a negative figure', () => {
    const p = plan({
      sessions: [session({ amount_refunded: 500 })],
      jobs: [job()],
      accountRefundTotal: 100,
    })
    expect(p.totals.refundsNotModelled).toBe(0)
  })
})
