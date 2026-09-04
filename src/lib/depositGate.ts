import { crewLogLine } from './jobPayments'

// depositGate — no job goes on the calendar until its deposit is recorded.
//
// WHY THIS EXISTS
//   Nine GC jobs have run through this CRM (Aaron GC, Wayne GC, Christian/NJZ,
//   Jerome/1Big) totalling $45,172.54, and every single one of them shows
//   deposit_paid = $0.00. Wayne's Salisbury job finished, was never invoiced for
//   months, and is now a $2,500 receivable past its lien window. The deposit ask
//   on a GC job is a manual step nobody owns, so it gets skipped — and once the
//   crew is on site the leverage is gone.
//
// THE TRAP THIS MODULE IS BUILT AROUND
//   The obvious implementation — "block scheduling unless jobs.deposit_paid > 0"
//   — would today block EVERY job on the board, and every one of those blocks
//   would be wrong. Measured against live Stripe + Supabase on 2026-08-23:
//
//     Stripe paid Checkout sessions (deposits):   21 sessions / $11,502.18
//     public.processed_deposit_sessions rows:      0
//     jobs.deposit_paid > 0:                      14 jobs / $6,866.89,
//                                                 newest is job #54 (March)
//
//     Every job now sitting in 'scheduled' or 'accepted_not_scheduled' HAS paid:
//       #72 Ferdi     $1,358.22   #88 Maciej  $702.78   #74 McGee   $1,185.00*
//       #81 Derek       $491.33   #92 Alex    $310.87   #95 Lori      $144.02
//       (* two sessions, $1,066.50 + $118.50)
//     ...and all six read deposit_paid = $0.00 in the CRM.
//
//   The deposits are not missing. The RECORDING is missing, because the Stripe
//   webhook is registered on the apex host and gets 307'd (see the stripeReconcile
//   work + project notes). A gate that trusts deposit_paid inherits that lie.
//
//   Hence: mode defaults to 'warn', not 'block'. Warn stamps the job and tells
//   the truth on screen without stopping the business. Vin flips
//   DEPOSIT_GATE_MODE=block only after the webhook is on www and the backfill
//   has run — at which point deposit_paid is finally worth gating on.
//
// Pure by design (no IO), same as completionInvoice.ts / jobPayments.ts, so the
// decision is unit-testable without a database or a Stripe key.

export type GateMode = 'off' | 'warn' | 'block'
export type GateScope = 'gc' | 'all'
export type GateDecision = 'allow' | 'warn' | 'block'

/** Retail deposit — unchanged, and already what /estimates/<token> charges. */
export const RETAIL_DEPOSIT_PCT = 0.1
/**
 * GC deposit. Higher than retail because a GC job carries risks a homeowner
 * job does not: materials are ordered against a permit set that can change, the
 * GC controls site access (so a slip costs Aguirre a crew day, not the customer),
 * and payment rides behind the GC's own draw from the owner. 25% covers the
 * ~20% materials load plus one mobilization day, so Vin is never fronting cash.
 */
export const GC_DEPOSIT_PCT = 0.25
/**
 * Floor for a GC deposit. A $1,200 GC punch-list job at 25% is $300, which does
 * not cover a truck, a helper and a day. Below this, charge the floor.
 */
export const GC_DEPOSIT_MIN = 500
/** Rounding slop, matching shouldMarkPaid() in jobPayments.ts. */
const SLOP = 1

/**
 * Statuses that mean "this job is committed work". Putting a date on anything
 * else is either a typo or a site visit, and neither should be gated.
 */
export const SCHEDULABLE_STATUSES = [
  'accepted_not_scheduled',
  'scheduled',
  'in_progress',
  'waiting_for_materials',
] as const

export type GateJob = {
  id: string
  job_number: number | null
  status: string
  client_name: string | null
  estimated_cost: number | string | null
  deposit_paid?: number | string | null
  amount_paid?: number | string | null
  /** Current value in the DB, i.e. before this PATCH. */
  scheduled_start?: string | null
  /** From customers.is_gc (migration 054). Null when the job has no customer. */
  is_gc?: boolean | null
}

export type GateInput = {
  job: GateJob
  /** The PATCH body's updates, already filtered to allowed fields. */
  updates: Record<string, unknown>
  mode: GateMode
  scope: GateScope
  /**
   * YYYY-MM-DD. A job whose scheduled_start was ALREADY set on or before this
   * date is grandfathered: it warns, it never blocks. Empty string = no
   * grandfathering (every scheduled job must be brought current).
   */
  grandfatherBefore: string
  /** Caller passed override_deposit_gate + a reason. */
  override?: { reason: string } | null
}

export type GateResult = {
  decision: GateDecision
  /** Machine-readable so the UI can branch without string matching. */
  code:
    | 'not_a_scheduling_action'
    | 'gate_off'
    | 'out_of_scope'
    | 'no_contract_total'
    | 'deposit_recorded'
    | 'grandfathered'
    | 'overridden'
    | 'deposit_missing'
  message: string
  isGc: boolean
  /** Dollars required before this job may hold a date. 0 when not applicable. */
  required: number
  /** Dollars the CRM currently has recorded against this job. */
  recorded: number
  /** required - recorded, floored at 0. */
  shortfall: number
  grandfathered: boolean
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * Dollars with cents, always: `$1,250.00`.
 *
 * Exported because the required-deposit figure is rendered in three surfaces of
 * one workflow — the schedule modal's panel, this module's 409/warn text, and
 * the SMS in data/depositPolicy.ts that Vince pastes to the customer. If those
 * ever disagree on rounding, the number he texts stops matching the number the
 * dashboard showed him.
 */
export const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * A deposit rate as the customer reads it, e.g. "10%" or "25%".
 *
 * Lives here, beside the rates it renders, rather than in estimateTiers — the
 * schedule modal and the GC terms copy need it too, and importing the whole
 * tier ladder to format one percentage would be backwards. estimateTiers
 * re-exports it so its existing callers are unaffected.
 */
export function depositRateLabel(rate: number = RETAIL_DEPOSIT_PCT): string {
  return `${Math.round(rate * 1000) / 10}%`
}

/** Env parsing lives here so route code has one import and no defaults to drift. */
export function gateModeFromEnv(env: NodeJS.ProcessEnv = process.env): GateMode {
  const raw = (env.DEPOSIT_GATE_MODE ?? 'warn').toLowerCase().trim()
  return raw === 'off' || raw === 'block' ? raw : 'warn'
}

export function gateScopeFromEnv(env: NodeJS.ProcessEnv = process.env): GateScope {
  return (env.DEPOSIT_GATE_SCOPE ?? 'gc').toLowerCase().trim() === 'all' ? 'all' : 'gc'
}

export function grandfatherBeforeFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.DEPOSIT_GATE_GRANDFATHER_BEFORE ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ''
}

/**
 * Fallback for jobs with no customer_id (imports, relayed leads). Deliberately
 * narrow: it matches the four GC naming conventions actually present in the
 * customers table rather than guessing at the word "construction" anywhere.
 * customers.is_gc is the real signal — this only catches orphans.
 */
export function looksLikeGc(name: string | null | undefined): boolean {
  if (!name) return false
  return /\(\s*g\.?c\.?\s*\)|\bg\.c\.\b|\bgc\b|\bnjz\b|construction\b|contracting\b|\bbuilders?\b/i.test(
    name
  )
}

export function isGcJob(job: GateJob): boolean {
  if (typeof job.is_gc === 'boolean') return job.is_gc
  return looksLikeGc(job.client_name)
}

/**
 * What must be in hand before this job holds a date.
 *
 * Returns 0 when there is no contract total — mirroring the shouldMarkPaid()
 * fix in jobPayments.ts. An unpriced job cannot have a percentage taken of it,
 * and inventing one would block the exact case (an unpriced GC job) that this
 * gate is supposed to help with. That case gets its own `no_contract_total`
 * warning instead, which is the more useful message anyway: price it first.
 */
export function requiredDeposit(job: GateJob): number {
  const total = num(job.estimated_cost)
  if (!(total > 0)) return 0
  if (!isGcJob(job)) return Math.round(total * RETAIL_DEPOSIT_PCT * 100) / 100
  const pct = Math.round(total * GC_DEPOSIT_PCT * 100) / 100
  return Math.max(pct, Math.min(GC_DEPOSIT_MIN, total))
}

/**
 * Is the deposit in? The single definition shared by the gate, the install
 * modal's status panel, and the calendar's green bar. An unpriced job has no
 * required deposit and therefore can never read as satisfied — the calendar
 * should not paint a $0 estimate green.
 */
export function depositSatisfied(job: GateJob): boolean {
  const required = requiredDeposit(job)
  return required > 0 && recordedDeposit(job) >= required - SLOP
}

/** Dollars actually recorded against the job, deposit channel first. */
export function recordedDeposit(job: GateJob): number {
  const dep = num(job.deposit_paid)
  if (dep > 0) return Math.round(dep * 100) / 100
  // A job can be paid through a channel that never touched deposit_paid (a
  // check logged as a final payment, a paid invoice). Money in hand is money in
  // hand — refusing to count it would block a job that is literally paid up.
  return Math.round(num(job.amount_paid) * 100) / 100
}

/**
 * Is this PATCH trying to put the job on the calendar?
 *
 * BOTH doors count, and this is the part a status-only gate gets wrong:
 *   - ScheduleInstallModal PATCHes scheduled_start/scheduled_end and
 *     deliberately does NOT touch status (see its header comment).
 *   - The kanban / job detail page PATCHes status -> 'scheduled' and may not
 *     touch the dates at all. Two jobs on the board right now (#74, #88) are
 *     status='scheduled' with scheduled_start = NULL, which is exactly what
 *     that second door looks like.
 * Clearing a date (scheduled_start: null) is a de-scheduling action and is
 * never gated.
 */
export function isSchedulingAction(
  updates: Record<string, unknown>,
  job: GateJob
): boolean {
  if ('scheduled_start' in updates && updates.scheduled_start) return true
  if (updates.status === 'scheduled' && job.status !== 'scheduled') return true
  return false
}

export function evaluateDepositGate(input: GateInput): GateResult {
  const { job, updates, mode, scope, grandfatherBefore, override } = input
  const isGc = isGcJob(job)
  const required = requiredDeposit(job)
  const recorded = recordedDeposit(job)
  const shortfall = Math.max(0, Math.round((required - recorded) * 100) / 100)

  const base = { isGc, required, recorded, shortfall, grandfathered: false }
  const label = job.job_number ? `#${job.job_number}` : 'This job'

  if (!isSchedulingAction(updates, job)) {
    return { ...base, decision: 'allow', code: 'not_a_scheduling_action', message: '' }
  }
  if (mode === 'off') {
    return { ...base, decision: 'allow', code: 'gate_off', message: '' }
  }
  if (scope === 'gc' && !isGc) {
    return { ...base, decision: 'allow', code: 'out_of_scope', message: '' }
  }

  // Grandfathering is evaluated BEFORE the money check, so an already-booked
  // job can still be moved around the calendar without a fight. It is computed
  // from the date the job ALREADY had, not the one being written — otherwise
  // backdating a new booking would slip straight through the gate.
  const existingStart = (job.scheduled_start ?? '').slice(0, 10)
  const grandfathered = Boolean(
    grandfatherBefore && existingStart && existingStart <= grandfatherBefore
  )

  if (depositSatisfied(job)) {
    return {
      ...base,
      decision: 'allow',
      code: 'deposit_recorded',
      message: `${money(recorded)} deposit on file.`,
    }
  }

  if (required <= 0) {
    // Unpriced job. Never block — you cannot pay a percentage of nothing — but
    // say the useful thing out loud.
    return {
      ...base,
      decision: 'warn',
      code: 'no_contract_total',
      message: `${label} has no estimate total, so no deposit can be calculated. Price the job before it holds a date.`,
    }
  }

  const ask =
    `${isGc ? 'GC job' : 'Job'} ${label} needs a ${money(required)} deposit ` +
    `(${depositRateLabel(isGc ? GC_DEPOSIT_PCT : RETAIL_DEPOSIT_PCT)} of ${money(num(job.estimated_cost))}) before it goes on the calendar. ` +
    `Recorded so far: ${money(recorded)} — ${money(shortfall)} short.`

  if (override?.reason) {
    return {
      ...base,
      decision: 'allow',
      code: 'overridden',
      grandfathered,
      message: `${ask} Scheduled anyway — reason: ${override.reason}`,
    }
  }

  if (grandfathered) {
    return {
      ...base,
      decision: 'warn',
      code: 'grandfathered',
      grandfathered: true,
      message:
        `${ask} Booked on ${existingStart}, before the ${grandfatherBefore} policy start — ` +
        `allowed, but collect it before the crew mobilises.`,
    }
  }

  return {
    ...base,
    decision: mode === 'block' ? 'block' : 'warn',
    code: 'deposit_missing',
    message:
      mode === 'block'
        ? `${ask} Record the deposit on the job, or re-send with override_deposit_gate + a reason.`
        : `${ask} (Gate is in warn mode — check Stripe before assuming it is unpaid; the deposit webhook has not recorded a session since March.)`,
  }
}

/** crew_log line, in the one bracketed format every writer of that column uses. */
export function gateLogLine(result: GateResult, authorName: string, now: Date): string {
  const verb =
    result.code === 'overridden'
      ? 'Deposit gate OVERRIDDEN'
      : result.decision === 'block'
        ? 'Deposit gate BLOCKED scheduling'
        : 'Deposit gate warning'
  return crewLogLine(authorName, now, `${verb}: ${result.message}`)
}
