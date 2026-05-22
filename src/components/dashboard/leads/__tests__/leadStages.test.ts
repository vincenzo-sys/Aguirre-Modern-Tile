import { describe, it, expect } from 'vitest'
import {
  STAGE_ORDER, STAGE_META, isQrStage, isJobStage,
  jobStatusForStage, stageOptionsFor,
} from '@/lib/leadStages'

describe('STAGE_ORDER', () => {
  it('has all 6 stages in the canonical order', () => {
    expect(STAGE_ORDER).toEqual([
      'new', 'reviewed', 'visit_scheduled',
      'lead_in_progress', 'estimate_sent', 'estimate_revised',
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
  it('classifies the three QR stages', () => {
    expect(isQrStage('new')).toBe(true)
    expect(isQrStage('reviewed')).toBe(true)
    expect(isQrStage('visit_scheduled')).toBe(true)
  })
  it('classifies the three job stages', () => {
    expect(isJobStage('lead_in_progress')).toBe(true)
    expect(isJobStage('estimate_sent')).toBe(true)
    expect(isJobStage('estimate_revised')).toBe(true)
  })
  it('isQrStage and isJobStage are complementary', () => {
    for (const s of STAGE_ORDER) {
      expect(isQrStage(s)).toBe(!isJobStage(s))
    }
  })
})

describe('jobStatusForStage', () => {
  it('maps job-stages to job.status values', () => {
    expect(jobStatusForStage('lead_in_progress')).toBe('lead')
    expect(jobStatusForStage('estimate_sent')).toBe('quoted')
    expect(jobStatusForStage('estimate_revised')).toBe('estimate_revised')
  })
  it('returns null for QR-only stages', () => {
    expect(jobStatusForStage('new')).toBe(null)
    expect(jobStatusForStage('reviewed')).toBe(null)
    expect(jobStatusForStage('visit_scheduled')).toBe(null)
  })
})

describe('stageOptionsFor', () => {
  it('QR rows: no options are disabled', () => {
    const opts = stageOptionsFor({ kind: 'quote_request' })
    expect(opts).toHaveLength(STAGE_ORDER.length)
    expect(opts.every((o) => !o.disabled)).toBe(true)
  })

  it('job rows: the three QR-stage options are disabled', () => {
    const opts = stageOptionsFor({ kind: 'job' })
    const byStage = Object.fromEntries(opts.map((o) => [o.stage, o]))
    expect(byStage.new.disabled).toBe(true)
    expect(byStage.reviewed.disabled).toBe(true)
    expect(byStage.visit_scheduled.disabled).toBe(true)
    expect(byStage.lead_in_progress.disabled).toBe(false)
    expect(byStage.estimate_sent.disabled).toBe(false)
    expect(byStage.estimate_revised.disabled).toBe(false)
  })

  it('job rows: disabled options carry a disabledReason', () => {
    const opts = stageOptionsFor({ kind: 'job' })
    for (const o of opts.filter((o) => o.disabled)) {
      expect(o.disabledReason).toBeTruthy()
    }
  })
})
