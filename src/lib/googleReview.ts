// Google review request logic — the "ask" that compounds the GMB review moat.
//
// Google Maps / GMB is the primary lead channel for the business, so every
// finished job is a chance to add a five-star review. This module holds the
// two things that decide whether an ask goes out:
//
//   1. getReviewUrl()        — the deep link, validated (see below)
//   2. selectReviewRequests() — pure eligibility logic, unit-tested
//
// The I/O (Supabase reads, OpenPhone sends, message_log writes) lives in
// /api/cron/review-requests. Keeping the decision pure means the guardrails
// that stop us texting 27 past customers at once are testable without a DB.

// ---------------------------------------------------------------------------
// Review URL
// ---------------------------------------------------------------------------

// Two URL shapes actually open Google's "write a review" box:
//
//   https://g.page/r/<PLACE_ID>/review                 (GMB "Ask for reviews")
//   https://search.google.com/local/writereview?placeid=<PLACE_ID>
//
// A plain https://www.google.com/maps/place/... URL does NOT — it drops the
// customer on the listing and they have to hunt for the review button. The
// old hardcoded fallback in the completion email was exactly that kind of
// search URL, which is why this validates instead of trusting the env var.
const REVIEW_URL_PATTERNS = [
  /^https:\/\/g\.page\/r\/[A-Za-z0-9_-]+\/review\/?$/,
  /^https:\/\/search\.google\.com\/local\/writereview\?placeid=[A-Za-z0-9_-]+$/,
  // Google's own shortener, handed out by the GMB dashboard.
  /^https:\/\/maps\.app\.goo\.gl\/[A-Za-z0-9_-]+$/,
]

export function isValidReviewUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return REVIEW_URL_PATTERNS.some((re) => re.test(url.trim()))
}

// Returns the configured review deep link, or null when it's missing or is a
// listing URL rather than a write-review URL. Callers MUST treat null as
// "don't send" — an ask with a bad link burns the one moment the customer is
// most willing to click.
export function getReviewUrl(): string | null {
  const raw = process.env.GOOGLE_REVIEW_URL?.trim()
  if (!isValidReviewUrl(raw)) return null
  return raw!
}

// ---------------------------------------------------------------------------
// Message copy
// ---------------------------------------------------------------------------
//
// Deliberately NOT offering anything in exchange for a review — Google's
// prohibited-content policy bans incentivized reviews and can strip a listing
// that solicits them. The $100 referral offer is a separate ask, on purpose.

export const REVIEW_MESSAGES = {
  ask1: (firstName: string, url: string) =>
    `Hi ${firstName || 'there'} — Vince from Aguirre Modern Tile. Hope you're loving the new tile! ` +
    `Would you mind leaving us a quick Google review? It takes about 30 seconds and it's genuinely ` +
    `the biggest thing that helps a small crew like ours get found: ${url}`,

  ask2: (firstName: string, url: string) =>
    `Hi ${firstName || 'there'} — Vince again, last nudge I promise. If you have 30 seconds for a ` +
    `Google review it would mean a lot to us: ${url}. And if anything about the job wasn't right, ` +
    `reply here instead and I'll take care of it.`,
} as const

export const REVIEW_TRIGGER_ASK1 = 'review_request_1'
export const REVIEW_TRIGGER_ASK2 = 'review_request_2'

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export type ReviewJob = {
  id: string
  title: string | null
  status: string
  client_name: string | null
  client_phone: string | null
  customer_id: string | null
  final_payment_at: string | null
  scheduled_end: string | null
  updated_at: string | null
}

export type LoggedMessage = {
  job_id: string | null
  phone_number: string | null
  direction: string
  trigger_type: string | null
  message: string | null
  created_at: string
}

export type SkipReason =
  | 'no-phone'
  | 'no-completion-date'
  | 'too-soon'
  | 'too-old'
  | 'already-asked-twice'
  | 'nudge-too-soon'
  | 'customer-replied'
  | 'complaint-risk'
  | 'rate-limited'

export type ReviewDecision =
  | { jobId: string; clientName: string; send: false; reason: SkipReason }
  | {
      jobId: string
      clientName: string
      send: true
      ask: 1 | 2
      phone: string
      firstName: string
      customerId: string | null
      ageDays: number
    }

export type SelectOptions = {
  /** Today, as an ISO instant. Injected so tests don't depend on the clock. */
  now: Date
  /** Wait this long after completion before the first ask. */
  minAgeDays: number
  /** Never ask about a job older than this — stops a first run blasting history. */
  maxAgeDays: number
  /** Days between ask 1 and the single follow-up nudge. */
  nudgeAfterDays: number
  /** Hard cap on sends per run, regardless of how many qualify. */
  maxPerRun: number
}

export const DEFAULT_SELECT_OPTIONS: Omit<SelectOptions, 'now'> = {
  minAgeDays: 2,
  maxAgeDays: 30,
  nudgeAfterDays: 5,
  maxPerRun: 5,
}

// Words that suggest the customer is unhappy or has an open issue. Asking one
// of these people for a public review is how a 4.9 becomes a 4.6, so the list
// errs toward over-suppressing: a skipped ask costs nothing (it lands in the
// Discord summary for Vince to handle by hand), a solicited one-star is
// permanent.
const COMPLAINT_KEYWORDS = [
  'leak', 'leaking', 'crack', 'cracked', 'cracking', 'chip', 'chipped',
  'loose', 'uneven', 'lippage', 'gap', 'grout is', 'regrout',
  'unhappy', 'disappointed', 'frustrated', 'upset', 'angry',
  'refund', 'redo', 'rework', 'come back', 'fix it', 'not right',
  'wrong', 'mistake', 'damage', 'damaged', 'broke', 'broken',
  'complaint', 'unacceptable', 'terrible', 'sloppy', 'mess',
  'lawyer', 'attorney', 'dispute', 'chargeback',
]

export function hasComplaintSignal(text: string | null | undefined): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  return COMPLAINT_KEYWORDS.some((kw) => lower.includes(kw))
}

// Digits-only comparison — message_log stores E.164 (+16175550142) while jobs
// store display format ((617) 555-0142). Comparing raw strings silently fails
// to match, which would defeat both the dedupe and the complaint guard.
function phoneKey(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

// When did this job actually finish? There's no completed_at column, so fall
// back through the columns that do exist, most-precise first. final_payment_at
// is an exact instant; scheduled_end is the planned last workday and is stable;
// updated_at is a last resort because any dashboard edit moves it forward.
export function completionAnchor(job: ReviewJob): string | null {
  return job.final_payment_at || job.scheduled_end || job.updated_at || null
}

function daysBetween(from: string, to: Date): number {
  const start = new Date(from.length <= 10 ? `${from}T00:00:00Z` : from).getTime()
  if (Number.isNaN(start)) return NaN
  return Math.floor((to.getTime() - start) / 86_400_000)
}

export function selectReviewRequests(
  jobs: ReviewJob[],
  log: LoggedMessage[],
  opts: SelectOptions
): ReviewDecision[] {
  const { now, minAgeDays, maxAgeDays, nudgeAfterDays, maxPerRun } = opts

  // Index the log once: asks already sent per job, and inbound traffic per
  // phone. Doing this per-job would be O(jobs x log) on every run.
  const asksByJob = new Map<string, LoggedMessage[]>()
  const inboundByPhone = new Map<string, LoggedMessage[]>()

  for (const m of log) {
    const isAsk =
      m.direction === 'outbound' &&
      (m.trigger_type === REVIEW_TRIGGER_ASK1 || m.trigger_type === REVIEW_TRIGGER_ASK2)
    if (isAsk && m.job_id) {
      const list = asksByJob.get(m.job_id) ?? []
      list.push(m)
      asksByJob.set(m.job_id, list)
    }
    if (m.direction === 'inbound') {
      const key = phoneKey(m.phone_number)
      if (!key) continue
      const list = inboundByPhone.get(key) ?? []
      list.push(m)
      inboundByPhone.set(key, list)
    }
  }

  const decisions: ReviewDecision[] = []
  let sendBudget = maxPerRun

  // Oldest first, so a backlog drains deterministically instead of the same
  // few jobs winning the cap every day.
  const ordered = [...jobs].sort((a, b) => {
    const aa = completionAnchor(a) ?? ''
    const bb = completionAnchor(b) ?? ''
    return aa.localeCompare(bb)
  })

  for (const job of ordered) {
    const clientName = job.client_name || '(no name)'
    const skip = (reason: SkipReason): ReviewDecision => ({
      jobId: job.id,
      clientName,
      send: false,
      reason,
    })

    const phone = job.client_phone
    if (!phone) {
      decisions.push(skip('no-phone'))
      continue
    }

    const anchor = completionAnchor(job)
    if (!anchor) {
      decisions.push(skip('no-completion-date'))
      continue
    }

    const ageDays = daysBetween(anchor, now)
    if (Number.isNaN(ageDays)) {
      decisions.push(skip('no-completion-date'))
      continue
    }
    if (ageDays < minAgeDays) {
      decisions.push(skip('too-soon'))
      continue
    }
    if (ageDays > maxAgeDays) {
      decisions.push(skip('too-old'))
      continue
    }

    const priorAsks = asksByJob.get(job.id) ?? []
    if (priorAsks.length >= 2) {
      decisions.push(skip('already-asked-twice'))
      continue
    }

    // Any inbound message that reads like a problem takes the job out of the
    // running entirely — including messages from before the ask, since an open
    // punch-list item means the job isn't really "done" in the customer's head.
    const inbound = inboundByPhone.get(phoneKey(phone)) ?? []
    if (inbound.some((m) => hasComplaintSignal(m.message))) {
      decisions.push(skip('complaint-risk'))
      continue
    }

    const ask: 1 | 2 = priorAsks.length === 0 ? 1 : 2

    if (ask === 2) {
      const askTimes = priorAsks.map((m) => m.created_at).sort()
      const lastAsk = askTimes[askTimes.length - 1]
      const sinceAsk = daysBetween(lastAsk, now)
      if (sinceAsk < nudgeAfterDays) {
        decisions.push(skip('nudge-too-soon'))
        continue
      }
      // A reply of any kind after the first ask means the ball is in Vince's
      // court — either they left the review, or they said something that
      // deserves a human. Either way, stop nudging.
      const repliedAfterAsk = inbound.some((m) => m.created_at > lastAsk)
      if (repliedAfterAsk) {
        decisions.push(skip('customer-replied'))
        continue
      }
    }

    if (sendBudget <= 0) {
      decisions.push(skip('rate-limited'))
      continue
    }
    sendBudget -= 1

    decisions.push({
      jobId: job.id,
      clientName,
      send: true,
      ask,
      phone,
      firstName: (job.client_name || '').trim().split(/\s+/)[0] || '',
      customerId: job.customer_id,
      ageDays,
    })
  }

  return decisions
}
