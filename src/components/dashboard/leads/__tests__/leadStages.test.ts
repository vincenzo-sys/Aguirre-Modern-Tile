import { describe, it, expect } from 'vitest'
import {
  STAGE_ORDER, STAGE_META, isQrStage, isJobStage,
  jobStatusForStage, stageOptionsFor,
} from '@/lib/leadStages'

describe('STAGE_ORDER', () => {
  it('has all 8 stages in the canonical order', () => {
    expect(STAGE_ORDER).toEqual([
      'new',
      'in_person_estimate_scheduled',
      'quoted',
      'edits_needed',
      'awaiting_response',
      'accepted_not_scheduled',
      'scheduled',
      'completed',
    ])
  })
})

describe('STAGE_META', () => {
  it('every stage has label, shortLabel, chip, topBorder, iconBg, icon', () => {
    for (const stage of STAGE_ORDER) {
      const m = STAGE_META[stage]
      expect(m.label.length).toBeGreaterThan(0)
      expect(m.shortLabel.length).toBeGreaterThan(0)
      expect(m.chip).toMatch(/bg-/)
      expect(m.topBorder).toMatch(/border-t-/)
      expect(m.iconBg).toMatch(/bg-/)
      expect(typeof m.icon).toBe('object')  // lucide is a forwardRef component
    }
  })
})

describe('isQrStage / isJobStage', () => {
  it('classifies the two QR-only stages', () => {
    expect(isQrStage('new')).toBe(true)
    expect(isQrStage('in_person_estimate_scheduled')).toBe(true)
  })
  it('classifies the six job-only stages', () => {
    expect(isJobStage('quoted')).toBe(true)
    expect(isJobStage('edits_needed')).toBe(true)
    expect(isJobStage('awaiting_response')).toBe(true)
    expect(isJobStage('accepted_not_scheduled')).toBe(true)
    expect(isJobStage('scheduled')).toBe(true)
    expect(isJobStage('completed')).toBe(true)
  })
  it('isQrStage and isJobStage are complementary', () => {
    for (const s of STAGE_ORDER) {
      expect(isQrStage(s)).toBe(!isJobStage(s))
    }
  })
})

describe('jobStatusForStage', () => {
  it('maps job-stages to job.status values', () => {
    expect(jobStatusForStage('quoted')).toBe('quoted')
    expect(jobStatusForStage('edits_needed')).toBe('estimate_revised')
    expect(jobStatusForStage('awaiting_response')).toBe('awaiting_response')
    expect(jobStatusForStage('accepted_not_scheduled')).toBe('accepted_not_scheduled')
    expect(jobStatusForStage('scheduled')).toBe('scheduled')
    expect(jobStatusForStage('completed')).toBe('completed')
  })
  it('returns null for QR-only stages', () => {
    expect(jobStatusForStage('new')).toBe(null)
    expect(jobStatusForStage('in_person_estimate_scheduled')).toBe(null)
  })
})

describe('stageOptionsFor', () => {
  it('QR rows: no options are disabled', () => {
    const opts = stageOptionsFor({ kind: 'quote_request' })
    expect(opts).toHaveLength(STAGE_ORDER.length)
    expect(opts.every((o) => !o.disabled)).toBe(true)
  })

  it('job rows: QR-only stages are not offered at all', () => {
    // Job rows have no inquiry to revert to, so the two QR-only stages are
    // omitted entirely rather than shown greyed-out (see stageOptionsFor).
    const opts = stageOptionsFor({ kind: 'job' })
    const stages = opts.map((o) => o.stage)
    expect(stages).not.toContain('new')
    expect(stages).not.toContain('in_person_estimate_scheduled')
    expect(stages).toEqual([
      'quoted',
      'edits_needed',
      'awaiting_response',
      'accepted_not_scheduled',
      'scheduled',
      'completed',
    ])
  })

  it('job rows: every offered option is selectable (none disabled)', () => {
    const opts = stageOptionsFor({ kind: 'job' })
    expect(opts.every((o) => !o.disabled)).toBe(true)
  })
})
