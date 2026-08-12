import { describe, it, expect } from 'vitest'
import {
  isValidReviewUrl,
  hasComplaintSignal,
  completionAnchor,
  selectReviewRequests,
  DEFAULT_SELECT_OPTIONS,
  REVIEW_TRIGGER_ASK1,
  REVIEW_MESSAGES,
  type ReviewJob,
  type LoggedMessage,
  type ReviewDecision,
} from './googleReview'

const NOW = new Date('2026-08-03T13:00:00Z')

function job(overrides: Partial<ReviewJob> = {}): ReviewJob {
  return {
    id: 'job-1',
    title: 'Master Bath',
    status: 'completed',
    client_name: 'Sarah Johnson',
    client_phone: '(617) 555-0142',
    customer_id: 'cust-1',
    final_payment_at: null,
    scheduled_end: '2026-07-28',
    updated_at: '2026-07-30T00:00:00Z',
    ...overrides,
  }
}

function msg(overrides: Partial<LoggedMessage> = {}): LoggedMessage {
  return {
    job_id: 'job-1',
    phone_number: '+16175550142',
    direction: 'outbound',
    trigger_type: REVIEW_TRIGGER_ASK1,
    message: 'ask',
    created_at: '2026-07-31T13:00:00Z',
    ...overrides,
  }
}

function run(jobs: ReviewJob[], log: LoggedMessage[] = [], opts = {}): ReviewDecision[] {
  return selectReviewRequests(jobs, log, { now: NOW, ...DEFAULT_SELECT_OPTIONS, ...opts })
}

function sends(decisions: ReviewDecision[]) {
  return decisions.filter((d) => d.send)
}

describe('isValidReviewUrl', () => {
  it('accepts the three real write-review link shapes', () => {
    expect(isValidReviewUrl('https://g.page/r/CQd7Xa9bTk2zEBM/review')).toBe(true)
    expect(isValidReviewUrl('https://search.google.com/local/writereview?placeid=ChIJabc123')).toBe(true)
    expect(isValidReviewUrl('https://maps.app.goo.gl/xY7kQ2')).toBe(true)
  })

  it('rejects a maps listing URL — it does not open the review box', () => {
    // This exact string was the old hardcoded fallback in the completion email.
    expect(isValidReviewUrl('https://www.google.com/maps/place/Aguirre+Modern+Tile')).toBe(false)
  })

  it('rejects empty, missing, and non-Google URLs', () => {
    expect(isValidReviewUrl(null)).toBe(false)
    expect(isValidReviewUrl(undefined)).toBe(false)
    expect(isValidReviewUrl('')).toBe(false)
    expect(isValidReviewUrl('https://example.com/review')).toBe(false)
    expect(isValidReviewUrl('http://g.page/r/abc/review')).toBe(false) // not https
  })
})

describe('hasComplaintSignal', () => {
  it('flags obvious trouble', () => {
    expect(hasComplaintSignal('the grout is cracking already')).toBe(true)
    expect(hasComplaintSignal('Can someone come back? There is a LEAK')).toBe(true)
    expect(hasComplaintSignal('honestly pretty disappointed')).toBe(true)
  })

  it('does not flag ordinary happy messages', () => {
    expect(hasComplaintSignal('Looks amazing, thank you!')).toBe(false)
    expect(hasComplaintSignal('Payment sent this morning')).toBe(false)
    expect(hasComplaintSignal(null)).toBe(false)
  })
})

describe('completionAnchor', () => {
  it('prefers final_payment_at, then scheduled_end, then updated_at', () => {
    expect(completionAnchor(job({ final_payment_at: '2026-08-01T10:00:00Z' })))
      .toBe('2026-08-01T10:00:00Z')
    expect(completionAnchor(job({ final_payment_at: null }))).toBe('2026-07-28')
    expect(completionAnchor(job({ final_payment_at: null, scheduled_end: null })))
      .toBe('2026-07-30T00:00:00Z')
  })

  it('returns null when the job has no usable date at all', () => {
    expect(
      completionAnchor(job({ final_payment_at: null, scheduled_end: null, updated_at: null }))
    ).toBeNull()
  })
})

describe('selectReviewRequests — timing window', () => {
  it('sends a first ask for a job finished inside the window', () => {
    const out = sends(run([job()]))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ send: true, ask: 1, firstName: 'Sarah' })
  })

  it('waits out the settle period instead of texting the day of', () => {
    const fresh = job({ scheduled_end: '2026-08-03', updated_at: '2026-08-03T00:00:00Z' })
    expect(run([fresh])[0]).toMatchObject({ send: false, reason: 'too-soon' })
  })

  it('will not ask about a job that finished months ago', () => {
    // The real backlog: 21 of 28 finished jobs are 45+ days old. Without this
    // guard the first run would text customers from last October.
    const old = job({ scheduled_end: '2025-11-06', updated_at: '2025-11-06T00:00:00Z' })
    expect(run([old])[0]).toMatchObject({ send: false, reason: 'too-old' })
  })
})

describe('selectReviewRequests — guardrails', () => {
  it('skips jobs with no phone number', () => {
    expect(run([job({ client_phone: null })])[0]).toMatchObject({
      send: false,
      reason: 'no-phone',
    })
  })

  it('never asks a third time', () => {
    const log = [
      msg({ trigger_type: 'review_request_1', created_at: '2026-07-25T13:00:00Z' }),
      msg({ trigger_type: 'review_request_2', created_at: '2026-07-30T13:00:00Z' }),
    ]
    expect(run([job()], log)[0]).toMatchObject({ send: false, reason: 'already-asked-twice' })
  })

  it('suppresses the ask when the customer reported a problem', () => {
    const log = [msg({ direction: 'inbound', message: 'one tile is loose by the door' })]
    expect(run([job()], log)[0]).toMatchObject({ send: false, reason: 'complaint-risk' })
  })

  it('matches complaint texts across phone formats (E.164 log vs display job)', () => {
    // message_log stores +16175550142; jobs store (617) 555-0142. Comparing
    // the raw strings would silently miss and we would text an unhappy customer.
    const log = [
      msg({ direction: 'inbound', phone_number: '+1 617-555-0142', message: 'there is a crack' }),
    ]
    expect(run([job({ client_phone: '617.555.0142' })], log)[0]).toMatchObject({
      reason: 'complaint-risk',
    })
  })

  it('holds the nudge until enough days have passed', () => {
    const log = [msg({ created_at: '2026-08-01T13:00:00Z' })] // 2 days ago, need 5
    expect(run([job()], log)[0]).toMatchObject({ send: false, reason: 'nudge-too-soon' })
  })

  it('sends the nudge once the gap has elapsed and nobody replied', () => {
    const log = [msg({ created_at: '2026-07-27T13:00:00Z' })] // 7 days ago
    const out = sends(run([job()], log))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ ask: 2 })
  })

  it('stops nudging as soon as the customer replies to the first ask', () => {
    const log = [
      msg({ created_at: '2026-07-27T13:00:00Z' }),
      msg({ direction: 'inbound', message: 'just left one!', created_at: '2026-07-28T09:00:00Z' }),
    ]
    expect(run([job()], log)[0]).toMatchObject({ send: false, reason: 'customer-replied' })
  })

  it('caps sends per run and drains oldest-first', () => {
    const jobs = [
      job({ id: 'a', scheduled_end: '2026-07-20', client_name: 'Ann A' }),
      job({ id: 'b', scheduled_end: '2026-07-22', client_name: 'Ben B' }),
      job({ id: 'c', scheduled_end: '2026-07-24', client_name: 'Cal C' }),
    ]
    const out = run(jobs, [], { maxPerRun: 2 })
    expect(sends(out).map((d) => d.jobId)).toEqual(['a', 'b'])
    expect(out.find((d) => d.jobId === 'c')).toMatchObject({
      send: false,
      reason: 'rate-limited',
    })
  })

  it('does not let one job\'s prior ask suppress another job', () => {
    const log = [
      msg({ job_id: 'other-job', trigger_type: 'review_request_1' }),
      msg({ job_id: 'other-job', trigger_type: 'review_request_2' }),
    ]
    expect(sends(run([job()], log))).toHaveLength(1)
  })
})

describe('REVIEW_MESSAGES', () => {
  it('includes the link and stays inside a reasonable SMS length', () => {
    const url = 'https://g.page/r/CQd7Xa9bTk2zEBM/review'
    const body = REVIEW_MESSAGES.ask1('Sarah', url)
    expect(body).toContain(url)
    expect(body).toContain('Sarah')
    expect(body.length).toBeLessThan(320) // 2 SMS segments
  })

  it('falls back gracefully when there is no first name', () => {
    expect(REVIEW_MESSAGES.ask1('', 'https://g.page/r/x/review')).toContain('Hi there')
  })

  it('offers nothing in exchange for the review (Google policy)', () => {
    const url = 'https://g.page/r/x/review'
    for (const body of [REVIEW_MESSAGES.ask1('Sarah', url), REVIEW_MESSAGES.ask2('Sarah', url)]) {
      expect(body).not.toMatch(/\$|discount|gift card|free |coupon|in exchange/i)
    }
  })
})
