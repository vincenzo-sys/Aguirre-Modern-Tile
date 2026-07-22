import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { recomputeJobFinancials } from './jobPayments'

// Stateful in-memory fake of the money-relevant slice of the DB, exercising the
// REAL recomputeJobFinancials across a full job lifecycle. This is the
// integration-style guard the payment rework needed: unit tests pin the helper
// in isolation, but the bugs the review found were about how the three payment
// CHANNELS (paid invoices, final_payment_amount, deposit_paid) combine over a
// sequence of operations. Each scenario mutates a channel the way the real
// route does, then calls recompute and asserts amount_paid — proving no channel
// ever wipes another.
interface DB {
  job: {
    id: string
    deposit_paid: number
    final_payment_amount: number
    amount_paid: number
    amount_invoiced: number
    estimated_cost: number
  }
  invoices: Array<{ amount: number; status: string }>
}

function makeStatefulSupabase(db: DB): SupabaseClient {
  function query(table: string) {
    const state: { op: 'select' | 'update'; payload: Record<string, number> | null } = {
      op: 'select',
      payload: null,
    }
    const q = {
      select() { state.op = 'select'; return q },
      update(payload: Record<string, number>) { state.op = 'update'; state.payload = payload; return q },
      eq() { return q },
      single() { return q },
      then(resolve: (v: { data: unknown; error: null }) => void) {
        if (state.op === 'update') {
          if (table === 'jobs' && state.payload) Object.assign(db.job, state.payload)
          return resolve({ data: null, error: null })
        }
        if (table === 'invoices') return resolve({ data: db.invoices, error: null })
        if (table === 'jobs') return resolve({ data: { ...db.job }, error: null })
        return resolve({ data: null, error: null })
      },
    }
    return q
  }
  return { from: (t: string) => query(t) } as unknown as SupabaseClient
}

function freshJob(): DB {
  return {
    job: { id: 'j1', deposit_paid: 0, final_payment_amount: 0, amount_paid: 0, amount_invoiced: 0, estimated_cost: 10000 },
    invoices: [],
  }
}

describe('payment lifecycle — no channel wipes another', () => {
  it('deposit then a paid invoice: deposit survives (the HIGH regression)', async () => {
    const db = makeStatefulSupabaseDb()
    // 1. Manual "Deposit received" $1,000 → writes the deposit_paid channel.
    db.job.deposit_paid = 1000
    await recomputeJobFinancials(db.client, 'j1')
    expect(db.job.amount_paid).toBe(1000)

    // 2. A $9,000 balance invoice is created and paid via Stripe.
    db.invoices.push({ amount: 9000, status: 'paid' })
    await recomputeJobFinancials(db.client, 'j1')

    // Deposit is NOT wiped — amount_paid spans both channels.
    expect(db.job.amount_paid).toBe(10000)
    expect(db.job.amount_invoiced).toBe(9000)
  })

  it('all-cash flow: deposit then final payment, no invoices (the exact review case)', async () => {
    const db = makeStatefulSupabaseDb()
    // $1,000 cash deposit
    db.job.deposit_paid = 1000
    await recomputeJobFinancials(db.client, 'j1')
    expect(db.job.amount_paid).toBe(1000)

    // $9,000 cash final payment → final_payment_amount channel
    db.job.final_payment_amount = 9000
    await recomputeJobFinancials(db.client, 'j1')

    // Covers the $10k job in full — deposit preserved (was dropped to 9000 pre-fix).
    expect(db.job.amount_paid).toBe(10000)
    expect(db.job.amount_paid).toBeGreaterThanOrEqual(db.job.estimated_cost - 1) // would flip status to 'paid'
  })

  it('three channels at once: deposit + final + paid invoices, unpaid excluded', async () => {
    const db = makeStatefulSupabaseDb()
    db.job.deposit_paid = 1000
    db.job.final_payment_amount = 500
    db.invoices.push({ amount: 5000, status: 'paid' }, { amount: 200, status: 'sent' })
    await recomputeJobFinancials(db.client, 'j1')
    expect(db.job.amount_paid).toBe(6500) // 1000 + 500 + 5000 (unpaid 'sent' excluded)
    expect(db.job.amount_invoiced).toBe(5200) // 5000 + 200
  })

  it('voiding a paid invoice drops amount_paid AND amount_invoiced', async () => {
    const db = makeStatefulSupabaseDb()
    db.invoices.push({ amount: 5000, status: 'paid' })
    await recomputeJobFinancials(db.client, 'j1')
    expect(db.job.amount_paid).toBe(5000)

    db.invoices[0].status = 'void'
    await recomputeJobFinancials(db.client, 'j1')
    expect(db.job.amount_paid).toBe(0)
    expect(db.job.amount_invoiced).toBe(0)
  })

  it('recompute is idempotent — running it twice yields the same totals', async () => {
    const db = makeStatefulSupabaseDb()
    db.job.deposit_paid = 1000
    db.invoices.push({ amount: 4000, status: 'paid' })
    await recomputeJobFinancials(db.client, 'j1')
    const first = db.job.amount_paid
    await recomputeJobFinancials(db.client, 'j1')
    expect(db.job.amount_paid).toBe(first)
    expect(db.job.amount_paid).toBe(5000)
  })

  it('rounds mixed-cents channels to cents', async () => {
    const db = makeStatefulSupabaseDb()
    db.job.deposit_paid = 10.11
    db.job.final_payment_amount = 0
    db.invoices.push({ amount: 33.33, status: 'paid' })
    await recomputeJobFinancials(db.client, 'j1')
    expect(db.job.amount_paid).toBe(43.44)
  })
})

// Small wrapper so each scenario gets an isolated stateful DB + a client bound
// to it, with `db.job` / `db.invoices` directly mutable and `db.client` to pass in.
function makeStatefulSupabaseDb() {
  const state = freshJob()
  const client = makeStatefulSupabase(state)
  return { job: state.job, invoices: state.invoices, client }
}
