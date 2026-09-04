import { describe, it, expect } from 'vitest'
import {
  evaluateDepositGate,
  isSchedulingAction,
  looksLikeGc,
  recordedDeposit,
  requiredDeposit,
  type GateJob,
} from './depositGate'

const job = (over: Partial<GateJob> = {}): GateJob => ({
  id: 'j1',
  job_number: 72,
  status: 'accepted_not_scheduled',
  client_name: 'Ferdi Alimadhi',
  estimated_cost: 10000,
  deposit_paid: 0,
  amount_paid: 0,
  scheduled_start: null,
  is_gc: false,
  ...over,
})

const run = (over: Partial<Parameters<typeof evaluateDepositGate>[0]> = {}) =>
  evaluateDepositGate({
    job: job(),
    updates: { scheduled_start: '2026-09-01' },
    mode: 'block',
    scope: 'all',
    grandfatherBefore: '',
    override: null,
    ...over,
  })

describe('looksLikeGc', () => {
  it('matches the GC naming conventions actually in the customers table', () => {
    expect(looksLikeGc('Aaron (GC)')).toBe(true)
    expect(looksLikeGc('Wayne GC')).toBe(true)
    expect(looksLikeGc('Christian (NJZ)')).toBe(true)
    expect(looksLikeGc('Jerome — 1Big Construction')).toBe(true)
  })
  it('does not match ordinary homeowners', () => {
    expect(looksLikeGc('Ferdi Alimadhi')).toBe(false)
    expect(looksLikeGc('Maciej Pietrusinski')).toBe(false)
    expect(looksLikeGc(null)).toBe(false)
  })
})

describe('requiredDeposit', () => {
  it('is 10% for retail', () => {
    expect(requiredDeposit(job({ estimated_cost: 6961.15 }))).toBe(696.12)
  })
  it('is 25% for a GC', () => {
    expect(requiredDeposit(job({ is_gc: true, estimated_cost: 9100 }))).toBe(2275)
  })
  it('applies the $500 floor to a small GC job', () => {
    expect(requiredDeposit(job({ is_gc: true, estimated_cost: 1200 }))).toBe(500)
  })
  it('never asks for more than the job is worth', () => {
    expect(requiredDeposit(job({ is_gc: true, estimated_cost: 300 }))).toBe(300)
  })
  it('is 0 when the job has no contract total', () => {
    // Job #96 (Alyssa Pritchard) and #50 (Pamela Infante) are both $0 today.
    expect(requiredDeposit(job({ estimated_cost: 0 }))).toBe(0)
    expect(requiredDeposit(job({ estimated_cost: null }))).toBe(0)
  })
})

describe('recordedDeposit', () => {
  it('prefers the deposit channel', () => {
    expect(recordedDeposit(job({ deposit_paid: 500, amount_paid: 500 }))).toBe(500)
  })
  it('falls back to amount_paid when the money landed in another channel', () => {
    // A check logged as a final payment is still money in hand.
    expect(recordedDeposit(job({ deposit_paid: 0, amount_paid: 3000 }))).toBe(3000)
  })
  it('handles numeric strings from Postgres NUMERIC', () => {
    expect(recordedDeposit(job({ deposit_paid: '1044.64' }))).toBe(1044.64)
  })
})

describe('isSchedulingAction — both doors', () => {
  it('catches the calendar door (ScheduleInstallModal PATCHes dates only)', () => {
    expect(isSchedulingAction({ scheduled_start: '2026-09-01' }, job())).toBe(true)
  })
  it('catches the kanban door (status flip with no dates)', () => {
    // Jobs #74 and #88 are status=scheduled with scheduled_start = NULL today.
    expect(isSchedulingAction({ status: 'scheduled' }, job())).toBe(true)
  })
  it('does not fire on a status flip that is already scheduled', () => {
    expect(isSchedulingAction({ status: 'scheduled' }, job({ status: 'scheduled' }))).toBe(false)
  })
  it('never gates de-scheduling', () => {
    expect(isSchedulingAction({ scheduled_start: null }, job())).toBe(false)
  })
  it('ignores unrelated edits', () => {
    expect(isSchedulingAction({ notes: 'call Aaron' }, job())).toBe(false)
    expect(isSchedulingAction({ status: 'completed' }, job())).toBe(false)
  })
})

describe('evaluateDepositGate', () => {
  it('blocks a GC job with no deposit', () => {
    const r = run({ job: job({ is_gc: true, estimated_cost: 9100 }) })
    expect(r.decision).toBe('block')
    expect(r.code).toBe('deposit_missing')
    expect(r.required).toBe(2275)
    expect(r.shortfall).toBe(2275)
    expect(r.message).toContain('$2,275.00')
  })

  it('allows once the deposit is recorded', () => {
    const r = run({ job: job({ is_gc: true, estimated_cost: 9100, deposit_paid: 2275 }) })
    expect(r.decision).toBe('allow')
    expect(r.code).toBe('deposit_recorded')
  })

  it('allows within $1 of the requirement (rounding slop)', () => {
    const r = run({ job: job({ is_gc: true, estimated_cost: 9100, deposit_paid: 2274.5 }) })
    expect(r.decision).toBe('allow')
  })

  it('leaves non-GC jobs alone when scope is gc', () => {
    const r = run({ scope: 'gc', job: job({ is_gc: false }) })
    expect(r.decision).toBe('allow')
    expect(r.code).toBe('out_of_scope')
  })

  it('warns instead of blocking in warn mode — the shipping default', () => {
    const r = run({ mode: 'warn', job: job({ is_gc: true }) })
    expect(r.decision).toBe('warn')
    expect(r.code).toBe('deposit_missing')
  })

  it('does nothing at all when the gate is off', () => {
    const r = run({ mode: 'off', job: job({ is_gc: true }) })
    expect(r.decision).toBe('allow')
    expect(r.code).toBe('gate_off')
  })

  it('warns rather than blocking an unpriced job', () => {
    const r = run({ job: job({ is_gc: true, estimated_cost: 0 }) })
    expect(r.decision).toBe('warn')
    expect(r.code).toBe('no_contract_total')
  })

  it('grandfathers a job that was already on the calendar before the cutover', () => {
    const r = run({
      job: job({ is_gc: true, scheduled_start: '2026-07-13' }),
      grandfatherBefore: '2026-08-23',
    })
    expect(r.decision).toBe('warn')
    expect(r.code).toBe('grandfathered')
    expect(r.grandfathered).toBe(true)
  })

  it('does NOT grandfather a brand-new booking backdated into the past', () => {
    // The job had no date; the PATCH is writing one. Grandfathering reads the
    // existing date, not the incoming one, so this still blocks.
    const r = run({
      job: job({ is_gc: true, scheduled_start: null }),
      updates: { scheduled_start: '2026-01-01' },
      grandfatherBefore: '2026-08-23',
    })
    expect(r.decision).toBe('block')
  })

  it('allows with an explicit override reason and says so', () => {
    const r = run({
      job: job({ is_gc: true }),
      override: { reason: 'Aaron pays on completion, 6 jobs, never missed' },
    })
    expect(r.decision).toBe('allow')
    expect(r.code).toBe('overridden')
    expect(r.message).toContain('never missed')
  })

  it('is inert on a PATCH that is not scheduling anything', () => {
    const r = run({ job: job({ is_gc: true }), updates: { notes: 'hi' } })
    expect(r.decision).toBe('allow')
    expect(r.code).toBe('not_a_scheduling_action')
  })

  it('falls back to the name heuristic when is_gc is unknown', () => {
    // customers.is_gc missing (migration 054 not applied) => null, not false.
    const r = run({ job: job({ is_gc: null, client_name: 'Aaron (GC)', estimated_cost: 4000 }) })
    expect(r.isGc).toBe(true)
    expect(r.required).toBe(1000)
    expect(r.decision).toBe('block')
  })

  it('five of the six live jobs pass once their Stripe deposit is recorded', () => {
    // Estimates from Supabase, deposits from the real paid Stripe Checkout
    // sessions, both as of 2026-08-23.
    const live: Array<[number, number, number]> = [
      [88, 6961.15, 702.78],
      [74, 1185.0, 1185.0],
      [81, 4913.3, 491.33],
      [92, 3108.72, 310.87],
      [95, 1440.17, 144.02],
    ]
    for (const [n, est, paid] of live) {
      const r = run({
        scope: 'all',
        job: job({ job_number: n, estimated_cost: est, deposit_paid: paid, is_gc: false }),
      })
      expect(r.decision, `job #${n}`).toBe('allow')
    }
  })

  it('catches the repricing hole on job #72 (Ferdi) — a real $582.70 shortfall', () => {
    // He paid $1,358.22, which is exactly 10% of $13,582.20. The estimate is
    // now $19,409.15, so the quote grew by $5,826.95 AFTER the deposit landed
    // and nothing recalculated the deposit. This is the failure mode a gate
    // keyed only on "deposit_paid > 0" would wave straight through.
    const r = run({
      scope: 'all',
      job: job({ job_number: 72, estimated_cost: 19409.15, deposit_paid: 1358.22 }),
    })
    expect(r.decision).toBe('block')
    expect(r.required).toBe(1940.92)
    expect(r.shortfall).toBe(582.7)
  })
})
