import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { applySmartView } from '../SmartViewChips'
import type { PipelineItem } from '@/app/api/pipeline/route'

function item(over: Partial<PipelineItem> = {}): PipelineItem {
  return {
    kind: 'quote_request', id: over.id ?? Math.random().toString(36).slice(2),
    project_name: 'p', client_name: 'c',
    client_phone: null, client_email: null, client_address: null,
    source: 'website', stage: over.stage ?? 'new',
    estimated_cost: null, site_visit_at: null,
    next_follow_up: over.next_follow_up ?? null,
    last_contact_at: null, notes: null,
    created_at: over.created_at ?? '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    urgency: over.urgency ?? 10,
    ...over,
  } as PipelineItem
}

// Freeze time so 'today' / 'this week' calculations are deterministic.
const NOW = new Date('2026-05-15T12:00:00Z')
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(NOW) })
afterAll(() => { vi.useRealTimers() })

describe('applySmartView', () => {
  it("'all' returns everything", () => {
    const items = [item(), item(), item()]
    expect(applySmartView(items, 'all')).toEqual(items)
  })

  it("'today' = urgency >= 90", () => {
    const a = item({ urgency: 100 })
    const b = item({ urgency: 90 })
    const c = item({ urgency: 89 })
    const d = item({ urgency: 50 })
    const out = applySmartView([a, b, c, d], 'today')
    expect(out).toEqual([a, b])
  })

  it("'hotQuotes' = sent/revised AND urgency < 60", () => {
    const inHot = item({ stage: 'estimate_sent', urgency: 50 })
    const tooUrgent = item({ stage: 'estimate_sent', urgency: 60 })
    const wrongStage = item({ stage: 'new', urgency: 50 })
    const revised = item({ stage: 'estimate_revised', urgency: 30 })
    const out = applySmartView([inHot, tooUrgent, wrongStage, revised], 'hotQuotes')
    expect(out).toEqual([inHot, revised])
  })

  it("'stale' = urgency in {50, 70}", () => {
    const a = item({ urgency: 50 })
    const b = item({ urgency: 70 })
    const c = item({ urgency: 60 })  // 60 is "just arrived", not stale
    const out = applySmartView([a, b, c], 'stale')
    expect(out).toEqual([a, b])
  })

  it("'thisWeek' includes follow-ups within 7 days OR created within last 7 days", () => {
    // NOW = 2026-05-15. Window: 2026-05-08 → 2026-05-22.
    const followingSoon = item({ next_follow_up: '2026-05-20' })  // within 7d
    const followingFar  = item({ next_follow_up: '2026-06-01' })  // outside
    const createdRecent = item({ created_at: '2026-05-12T00:00:00Z' })  // within 7d back
    const createdOld    = item({ created_at: '2026-04-01T00:00:00Z', next_follow_up: null })
    const out = applySmartView([followingSoon, followingFar, createdRecent, createdOld], 'thisWeek')
    expect(out).toContain(followingSoon)
    expect(out).toContain(createdRecent)
    expect(out).not.toContain(followingFar)
    expect(out).not.toContain(createdOld)
  })
})
