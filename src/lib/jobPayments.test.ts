import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { recomputeJobFinancials } from './jobPayments'

// Minimal chainable fake of the Supabase query builder — just enough to serve
// the exact chains recomputeJobFinancials uses:
//   from('invoices').select(...).eq(...)                      → { data: invoices }
//   from('jobs').select('final_payment_amount').eq(...).single() → { data: { ... } }
//   from('jobs').update({...}).eq(...)                        → captured via onUpdate
function makeFakeSupabase(opts: {
  invoices: Array<{ amount: number; status: string }>
  finalPayment: number | null
  onUpdate?: (payload: Record<string, unknown>) => void
}): SupabaseClient {
  return {
    from(table: string) {
      const state: { op: 'select' | 'update'; payload: Record<string, unknown> | null } = {
        op: 'select',
        payload: null,
      }
      const builder = {
        select() { state.op = 'select'; return builder },
        update(payload: Record<string, unknown>) { state.op = 'update'; state.payload = payload; return builder },
        eq() { return builder },
        single() { return builder },
        then(resolve: (v: { data: unknown; error: null }) => void) {
          if (state.op === 'update') {
            if (table === 'jobs' && state.payload) opts.onUpdate?.(state.payload)
            return resolve({ data: null, error: null })
          }
          if (table === 'invoices') return resolve({ data: opts.invoices, error: null })
          if (table === 'jobs') return resolve({ data: { final_payment_amount: opts.finalPayment }, error: null })
          return resolve({ data: null, error: null })
        },
      }
      return builder
    },
  } as unknown as SupabaseClient
}

describe('recomputeJobFinancials — amount_paid spans all channels', () => {
  it('adds the manual final payment to paid invoices instead of wiping it', async () => {
    let saved: Record<string, unknown> | null = null
    const supabase = makeFakeSupabase({
      invoices: [
        { amount: 9000, status: 'paid' },
        { amount: 500, status: 'void' }, // excluded from both rollups
      ],
      finalPayment: 1000,
      onUpdate: (p) => { saved = p },
    })

    const res = await recomputeJobFinancials(supabase, 'job-1')

    // Before the fix this was 9000 (the deposit/final payment got wiped).
    expect(res.amount_paid).toBe(10000)
    expect(res.amount_invoiced).toBe(9000)
    expect(saved).toEqual({ amount_paid: 10000, amount_invoiced: 9000 })
  })

  it('excludes voided invoices and handles a null final_payment_amount', async () => {
    const supabase = makeFakeSupabase({
      invoices: [
        { amount: 200, status: 'paid' },
        { amount: 800, status: 'void' },
        { amount: 300, status: 'sent' },
      ],
      finalPayment: null,
    })

    const res = await recomputeJobFinancials(supabase, 'job-2')

    expect(res.amount_paid).toBe(200) // only the paid invoice; final payment 0
    expect(res.amount_invoiced).toBe(500) // 200 + 300 (void excluded)
  })

  it('rounds to cents', async () => {
    const supabase = makeFakeSupabase({
      invoices: [{ amount: 33.33, status: 'paid' }],
      finalPayment: 10.11,
    })
    const res = await recomputeJobFinancials(supabase, 'job-3')
    expect(res.amount_paid).toBe(43.44)
  })
})
