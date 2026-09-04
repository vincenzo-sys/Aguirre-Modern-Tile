import { describe, it, expect } from 'vitest'
import { buildDayLayout, maxLaneOn, type SpanInput, type Segment } from './calendarLayout'

function install(id: string, startYmd: string, endYmd: string): SpanInput {
  return { id: `install:${id}`, kind: 'install', startYmd, endYmd }
}
function visit(id: string, day: string): SpanInput {
  return { id: `estimate_visit:${id}`, kind: 'estimate_visit', startYmd: day, endYmd: day }
}

function lanesOf(map: Map<string, Segment[]>, id: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [day, segs] of map) {
    const hit = segs.find((s) => s.id === id)
    if (hit) out[day] = hit.lane
  }
  return out
}

describe('buildDayLayout', () => {
  it('places a single-day span on one day in lane 0', () => {
    const map = buildDayLayout([visit('a', '2026-09-08')])
    expect([...map.keys()]).toEqual(['2026-09-08'])
    expect(map.get('2026-09-08')).toEqual([
      { id: 'estimate_visit:a', kind: 'estimate_visit', lane: 0, isStart: true, isEnd: true, dayIndex: 1, spanDays: 1 },
    ])
  })

  it('expands a multi-day span across every day it touches', () => {
    const map = buildDayLayout([install('a', '2026-09-08', '2026-09-10')])
    expect([...map.keys()].sort()).toEqual(['2026-09-08', '2026-09-09', '2026-09-10'])
  })

  it('marks only the first and last day as start and end', () => {
    const map = buildDayLayout([install('a', '2026-09-08', '2026-09-10')])
    const seg = (d: string) => map.get(d)![0]
    expect([seg('2026-09-08').isStart, seg('2026-09-08').isEnd]).toEqual([true, false])
    expect([seg('2026-09-09').isStart, seg('2026-09-09').isEnd]).toEqual([false, false])
    expect([seg('2026-09-10').isStart, seg('2026-09-10').isEnd]).toEqual([false, true])
  })

  it('numbers days 1..n for "Day 3 of 5"', () => {
    const map = buildDayLayout([install('a', '2026-09-08', '2026-09-12')])
    expect(map.get('2026-09-10')![0]).toMatchObject({ dayIndex: 3, spanDays: 5 })
  })

  // The property the continuous bar depends on.
  it('holds ONE lane for the whole span', () => {
    const map = buildDayLayout([
      install('a', '2026-09-08', '2026-09-12'),
      install('b', '2026-09-08', '2026-09-12'),
    ])
    expect(new Set(Object.values(lanesOf(map, 'install:a'))).size).toBe(1)
    expect(new Set(Object.values(lanesOf(map, 'install:b'))).size).toBe(1)
  })

  it('gives two overlapping 3-day installs lanes 0 and 1 on all 3 days', () => {
    const map = buildDayLayout([
      install('a', '2026-09-08', '2026-09-10'),
      install('b', '2026-09-08', '2026-09-10'),
    ])
    for (const day of ['2026-09-08', '2026-09-09', '2026-09-10']) {
      expect(map.get(day)!.map((s) => s.lane), day).toEqual([0, 1])
    }
  })

  it('reuses a lane once the previous span has ended', () => {
    const map = buildDayLayout([
      install('a', '2026-09-08', '2026-09-09'),
      install('b', '2026-09-10', '2026-09-11'),
    ])
    expect(map.get('2026-09-08')![0].lane).toBe(0)
    expect(map.get('2026-09-10')![0].lane).toBe(0)
  })

  it('does NOT reuse a lane on the handoff day itself', () => {
    // b starts the same day a ends — they must not overlap in one lane.
    const map = buildDayLayout([
      install('a', '2026-09-08', '2026-09-10'),
      install('b', '2026-09-10', '2026-09-12'),
    ])
    const lanes = map.get('2026-09-10')!.map((s) => s.lane)
    expect(new Set(lanes).size).toBe(2)
  })

  it('gives the longer span the top lane when two start together', () => {
    const map = buildDayLayout([
      install('short', '2026-09-08', '2026-09-08'),
      install('long', '2026-09-08', '2026-09-12'),
    ])
    expect(map.get('2026-09-08')!.find((s) => s.id === 'install:long')!.lane).toBe(0)
  })

  it('is deterministic regardless of input order', () => {
    const spans = [
      install('a', '2026-09-08', '2026-09-10'),
      visit('v', '2026-09-09'),
      install('b', '2026-09-09', '2026-09-11'),
    ]
    const forward = buildDayLayout(spans)
    const backward = buildDayLayout([...spans].reverse())
    for (const day of forward.keys()) {
      expect(backward.get(day), day).toEqual(forward.get(day))
    }
  })

  it('does not mutate the caller array', () => {
    const spans = [install('b', '2026-09-10', '2026-09-11'), install('a', '2026-09-08', '2026-09-09')]
    const snapshot = spans.map((s) => s.id)
    buildDayLayout(spans)
    expect(spans.map((s) => s.id)).toEqual(snapshot)
  })

  it('returns segments sorted by lane within a day', () => {
    const map = buildDayLayout([
      install('a', '2026-09-08', '2026-09-12'),
      install('b', '2026-09-08', '2026-09-12'),
      install('c', '2026-09-08', '2026-09-12'),
    ])
    const lanes = map.get('2026-09-10')!.map((s) => s.lane)
    expect(lanes).toEqual([...lanes].sort((x, y) => x - y))
  })

  it('survives an end date before the start date', () => {
    const map = buildDayLayout([install('a', '2026-09-10', '2026-09-08')])
    expect([...map.keys()]).toEqual(['2026-09-10'])
    expect(map.get('2026-09-10')![0]).toMatchObject({ isStart: true, isEnd: true, spanDays: 1 })
  })

  it('handles an empty input', () => {
    expect(buildDayLayout([]).size).toBe(0)
  })
})

describe('maxLaneOn', () => {
  it('reports the highest occupied lane', () => {
    const map = buildDayLayout([
      install('a', '2026-09-08', '2026-09-08'),
      install('b', '2026-09-08', '2026-09-08'),
    ])
    expect(maxLaneOn(map.get('2026-09-08'))).toBe(1)
  })

  it('returns -1 for an empty or missing day', () => {
    expect(maxLaneOn(undefined)).toBe(-1)
    expect(maxLaneOn([])).toBe(-1)
  })
})
