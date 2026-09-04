import { describe, it, expect } from 'vitest'
import { JOB_STATUS_META, jobStatusMeta } from './jobStatus'

// The authoritative list is the Postgres enum, not the TypeScript union —
// the union is what drifted. Source of truth, in migration order:
//   schema.sql:8                          lead, quoted, scheduled, in_progress,
//                                         completed, paid, cancelled
//   005_add_waiting_for_materials_status  waiting_for_materials
//   018_sales_discipline                  accepted_not_scheduled, estimate_revised
//   035_awaiting_response_status          awaiting_response
// If someone runs ALTER TYPE job_status ADD VALUE, add it here and this test
// will tell you what else needs updating.
const DB_ENUM_VALUES = [
  'lead',
  'quoted',
  'estimate_revised',
  'awaiting_response',
  'accepted_not_scheduled',
  'scheduled',
  'in_progress',
  'waiting_for_materials',
  'completed',
  'paid',
  'cancelled',
]

describe('JOB_STATUS_META', () => {
  it('covers every value in the job_status enum', () => {
    for (const status of DB_ENUM_VALUES) {
      expect(JOB_STATUS_META, `missing meta for '${status}'`).toHaveProperty(status)
    }
  })

  it('has no entries the database does not have', () => {
    expect(Object.keys(JOB_STATUS_META).sort()).toEqual([...DB_ENUM_VALUES].sort())
  })

  it('gives every status a non-empty label, badge and chip', () => {
    for (const [status, meta] of Object.entries(JOB_STATUS_META)) {
      expect(meta.label, status).toBeTruthy()
      expect(meta.badge, status).toMatch(/bg-\S+/)
      expect(meta.chip, status).toMatch(/bg-\S+/)
    }
  })

  it('does not render two statuses identically', () => {
    // A picker that draws "In Progress" and "Waiting for Response" the same
    // way defeats the point of showing a status at all.
    const badges = Object.values(JOB_STATUS_META).map((m) => m.badge)
    expect(new Set(badges).size).toBe(badges.length)
  })
})

describe('jobStatusMeta', () => {
  it('returns the mapped meta for a known status', () => {
    expect(jobStatusMeta('accepted_not_scheduled').label).toBe('Accepted — Pick Date')
  })

  // This is the regression guard. Before src/lib/jobStatus.ts, an
  // awaiting_response job hit `statusConfig[status].className` on a
  // 10-key table and threw, taking the whole modal down with it.
  it('falls back instead of throwing on an unknown status', () => {
    expect(() => jobStatusMeta('some_future_status')).not.toThrow()
    const meta = jobStatusMeta('some_future_status')
    expect(meta.label).toBe('Some Future Status')
    expect(meta.badge).toContain('bg-gray-100')
  })

  it('handles null and undefined', () => {
    expect(jobStatusMeta(null).label).toBe('Unknown')
    expect(jobStatusMeta(undefined).label).toBe('Unknown')
    expect(jobStatusMeta('').label).toBe('Unknown')
  })
})
