import { describe, it, expect } from 'vitest'
import { bucketize, sumEstimatedCost } from '../buckets'
import type { PipelineItem } from '@/app/api/pipeline/route'

// Lightweight factory — every test only needs to override a few keys.
function item(over: Partial<PipelineItem> = {}): PipelineItem {
  return {
    kind: 'quote_request',
    id: over.id ?? Math.random().toString(36).slice(2),
    project_name: over.project_name ?? 'Test project',
    client_name: over.client_name ?? 'Test customer',
    client_phone: over.client_phone ?? null,
    client_email: over.client_email ?? null,
    client_address: over.client_address ?? null,
    source: over.source ?? 'website',
    stage: over.stage ?? 'new',
    estimated_cost: over.estimated_cost ?? null,
    site_visit_at: over.site_visit_at ?? null,
    next_follow_up: over.next_follow_up ?? null,
    last_contact_at: over.last_contact_at ?? null,
    notes: over.notes ?? null,
    created_at: over.created_at ?? '2026-05-01T00:00:00Z',
    updated_at: over.updated_at ?? '2026-05-01T00:00:00Z',
    urgency: over.urgency ?? 10,
    ...over,
  } as PipelineItem
}

describe('bucketize', () => {
  it('empty input → empty buckets', () => {
    const b = bucketize([])
    expect(b.actionNeeded).toEqual([])
    expect(b.working).toEqual([])
    expect(b.waiting).toEqual([])
    expect(b.stale).toEqual([])
  })

  it('urgency >= 90 lands in actionNeeded regardless of stage', () => {
    const a = item({ stage: 'new', urgency: 90 })
    const b = item({ stage: 'quoted', urgency: 100 })
    const c = item({ stage: 'awaiting_response', urgency: 95 })
    const out = bucketize([a, b, c])
    expect(out.actionNeeded).toHaveLength(3)
    expect(out.working).toEqual([])
    expect(out.waiting).toEqual([])
  })

  it('quoted stages with urgency < 100 land in waiting', () => {
    const sent = item({ stage: 'quoted', urgency: 50 })
    const revised = item({ stage: 'edits_needed', urgency: 60 })
    const chasing = item({ stage: 'awaiting_response', urgency: 60 })
    const out = bucketize([sent, revised, chasing])
    expect(out.waiting).toHaveLength(3)
    expect(out.stale).toEqual([])
  })

  it('urgency 50 / 70 lands in stale unless already in actionNeeded', () => {
    const a = item({ stage: 'new', urgency: 50 })
    const b = item({ stage: 'in_person_estimate_scheduled', urgency: 70 })
    const c = item({ stage: 'new', urgency: 90 })  // actionNeeded wins
    const out = bucketize([a, b, c])
    expect(out.stale.length).toBe(2)
    expect(out.actionNeeded.length).toBe(1)
  })

  it('working stages with low urgency land in working', () => {
    const a = item({ stage: 'new', urgency: 10 })
    const b = item({ stage: 'in_person_estimate_scheduled', urgency: 10 })
    const c = item({ stage: 'accepted_not_scheduled', urgency: 10 })
    const d = item({ stage: 'scheduled', urgency: 10 })
    const out = bucketize([a, b, c, d])
    expect(out.working).toHaveLength(4)
  })

  it('urgency 89 (just below boundary) stays in non-actionNeeded bucket', () => {
    const a = item({ stage: 'new', urgency: 89 })
    const out = bucketize([a])
    expect(out.actionNeeded).toEqual([])
    expect(out.working).toHaveLength(1)
  })

  it('quoted at urgency 100 stays in actionNeeded, not waiting', () => {
    const overdue = item({ stage: 'quoted', urgency: 100 })
    const out = bucketize([overdue])
    expect(out.actionNeeded).toHaveLength(1)
    expect(out.waiting).toEqual([])
  })
})

describe('sumEstimatedCost', () => {
  it('sums numeric estimated_cost, ignoring nulls', () => {
    const items = [
      item({ estimated_cost: 1000 }),
      item({ estimated_cost: null }),
      item({ estimated_cost: 2500 }),
    ]
    expect(sumEstimatedCost(items)).toBe(3500)
  })

  it('empty input → 0', () => {
    expect(sumEstimatedCost([])).toBe(0)
  })
})
