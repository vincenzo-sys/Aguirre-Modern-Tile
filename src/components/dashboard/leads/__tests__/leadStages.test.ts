import { describe, it, expect } from 'vitest'
import {
  STAGE_ORDER, STAGE_META, isQrStage, isJobStage,
  jobStatusForStage, stageOptionsFor,
} from '@/lib/leadStages'

describe('STAGE_ORDER', () => {
  it('has all 7 stages in the canonical order', () => {
    expect(STAGE_ORDER).toEqual([
      'new',
      'in_person_estimate_scheduled',
      'quoted',
      'edits_needed',
      'awaiting_response',
      'accepted_not_scheduled',
      'scheduled',
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
  it('classifies the five job-only stages', () => {
    expect(isJobStage('quoted')).toBe(true)
    expect(isJobStage('edits_needed')).toBe(true)
    expect(isJobStage('awaiting_response')).toBe(true)
    expect(isJobStage('accepted_not_scheduled')).toBe(true)
    expect(isJobStage('scheduled')).toBe(true)
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

  it('job rows: QR-only stage options are disabled', () => {
    const opts = stageOptionsFor({ kind: 'job' })
    const byStage = Object.fromEntries(opts.map((o) => [o.stage, o]))
    expect(byStage.new.disabled).toBe(true)
    expect(byStage.in_person_estimate_scheduled.disabled).toBe(true)
    expect(byStage.quoted.disabled).toBe(false)
    expect(byStage.edits_needed.disabled).toBe(false)
    expect(byStage.awaiting_response.disabled).toBe(false)
    expect(byStage.accepted_not_scheduled.disabled).toBe(false)
    expect(byStage.scheduled.disabled).toBe(false)
  })

  it('job rows: disabled options carry a disabledReason', () => {
    const opts = stageOptionsFor({ kind: 'job' })
    for (const o of opts.filter((o) => o.disabled)) {
      expect(o.disabledReason).toBeTruthy()
    }
  })
})
