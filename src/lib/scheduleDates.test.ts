import { describe, it, expect } from 'vitest'
import {
  ymdOf, parseYmd, daysBetween, shiftDate,
  spanDays, endFromSpan, eachDay, formatSpan, formatRangeShort,
} from './scheduleDates'

describe('parseYmd / ymdOf', () => {
  it('round-trips through local midnight', () => {
    expect(ymdOf(parseYmd('2026-09-08')!)).toBe('2026-09-08')
  })

  it('parses to LOCAL midnight, not UTC', () => {
    const d = parseYmd('2026-09-08')!
    expect(d.getHours()).toBe(0)
    expect(d.getDate()).toBe(8)
  })

  it('returns null on junk', () => {
    expect(parseYmd('')).toBeNull()
    expect(parseYmd(null)).toBeNull()
    expect(parseYmd('not-a-date')).toBeNull()
  })

  it('tolerates a full ISO timestamp by taking the date part', () => {
    expect(ymdOf(parseYmd('2026-09-08T14:30:00Z')!)).toBe('2026-09-08')
  })
})

describe('shiftDate', () => {
  it('moves forward and backward', () => {
    expect(shiftDate('2026-09-08', 4)).toBe('2026-09-12')
    expect(shiftDate('2026-09-12', -4)).toBe('2026-09-08')
  })

  it('crosses month and year boundaries', () => {
    expect(shiftDate('2026-09-30', 1)).toBe('2026-10-01')
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
  })

  // The bug this library exists to kill: CalendarView's shiftDate did
  // `.toISOString().slice(0,10)` on a local-midnight Date, which lands on the
  // previous day in any UTC+ zone. Reading local getters back out is the fix.
  it('never goes through toISOString', () => {
    for (let i = 0; i < 40; i++) {
      const start = shiftDate('2026-01-01', i)
      expect(shiftDate(start, 1)).toBe(shiftDate('2026-01-01', i + 1))
    }
  })
})

describe('daysBetween across DST', () => {
  // US DST 2026: forward Mar 8, back Nov 1. These spans are 23h and 25h of
  // real time; Math.floor would report 2 days for a 3-day install.
  it('counts calendar days across the spring-forward boundary', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
  })

  it('counts calendar days across the fall-back boundary', () => {
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2)
  })

  it('is signed and zero for the same day', () => {
    expect(daysBetween('2026-09-12', '2026-09-08')).toBe(-4)
    expect(daysBetween('2026-09-08', '2026-09-08')).toBe(0)
  })
})

describe('spanDays / endFromSpan', () => {
  it('is inclusive of both endpoints', () => {
    expect(spanDays('2026-09-08', '2026-09-12')).toBe(5)
    expect(spanDays('2026-09-08', '2026-09-08')).toBe(1)
  })

  it('treats a missing end as a single day', () => {
    expect(spanDays('2026-09-08', null)).toBe(1)
    expect(spanDays('2026-09-08', undefined)).toBe(1)
    expect(spanDays('2026-09-08', '')).toBe(1)
  })

  it('never returns less than 1, even for a backwards end', () => {
    expect(spanDays('2026-09-12', '2026-09-08')).toBe(1)
  })

  it('endFromSpan is inclusive: 1 day ends on the start date', () => {
    expect(endFromSpan('2026-09-08', 1)).toBe('2026-09-08')
    expect(endFromSpan('2026-09-08', 5)).toBe('2026-09-12')
  })

  it('clamps nonsense day counts to a single day', () => {
    expect(endFromSpan('2026-09-08', 0)).toBe('2026-09-08')
    expect(endFromSpan('2026-09-08', -3)).toBe('2026-09-08')
    expect(endFromSpan('2026-09-08', NaN)).toBe('2026-09-08')
  })

  it('rounds a fractional day up, matching deriveScheduledEnd', () => {
    expect(endFromSpan('2026-09-08', 1.5)).toBe('2026-09-09')
  })

  // The property that keeps the duration chips honest: whatever end date the
  // chips write, reading the span back must select the same chip.
  it('round-trips endFromSpan(start, spanDays(start, end)) === end', () => {
    const start = '2026-02-25'
    for (let n = 1; n <= 20; n++) {
      const end = endFromSpan(start, n)
      expect(spanDays(start, end)).toBe(n)
      expect(endFromSpan(start, spanDays(start, end))).toBe(end)
    }
  })

  it('round-trips across the DST boundary too', () => {
    const start = '2026-10-30'
    for (let n = 1; n <= 8; n++) {
      expect(spanDays(start, endFromSpan(start, n))).toBe(n)
    }
  })
})

describe('eachDay', () => {
  it('includes both endpoints', () => {
    expect(eachDay('2026-09-08', '2026-09-11')).toEqual([
      '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11',
    ])
  })

  it('returns a single day when start === end', () => {
    expect(eachDay('2026-09-08', '2026-09-08')).toEqual(['2026-09-08'])
  })

  it('returns the start when the end is earlier, rather than looping forever', () => {
    expect(eachDay('2026-09-08', '2026-09-01')).toEqual(['2026-09-08'])
  })

  it('is bounded', () => {
    expect(eachDay('2020-01-01', '2030-01-01').length).toBe(400)
  })

  it('spans a DST boundary without dropping or duplicating a day', () => {
    const days = eachDay('2026-10-31', '2026-11-02')
    expect(days).toEqual(['2026-10-31', '2026-11-01', '2026-11-02'])
    expect(new Set(days).size).toBe(3)
  })
})

describe('formatting', () => {
  it('formatSpan reads as one day or a range', () => {
    expect(formatSpan('2026-09-08', '2026-09-08')).toContain('1 day')
    expect(formatSpan('2026-09-08', null)).toContain('1 day')
    const multi = formatSpan('2026-09-08', '2026-09-12')
    expect(multi).toContain('5 days')
    expect(multi).toContain('→')
  })

  it('formatRangeShort collapses a single day', () => {
    expect(formatRangeShort('2026-09-08', '2026-09-08')).toBe('Sep 8')
    expect(formatRangeShort('2026-09-08', null)).toBe('Sep 8')
    expect(formatRangeShort('2026-09-08', '2026-09-12')).toBe('Sep 8 – Sep 12')
  })
})
