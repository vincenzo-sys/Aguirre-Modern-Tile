// Lane assignment for multi-day calendar bars.
//
// The old approach pushed the SAME event object into every day's array, so a
// 5-day install rendered as five independent chips, each repeating
// "#92 Alex Bathroom" and each burning a slot against the month cell's 4-chip
// cap. The install modal's own help text claimed "multi-day spans render as
// one bar across cells"; they did not.
//
// The fix is a lane: a span holds one vertical slot for its ENTIRE life, so it
// sits at the same y-offset in every cell it touches. That is the precondition
// for the segments reading as one continuous bar — without it, a span can drop
// to a different row halfway through the week and the illusion breaks.
//
// This is greedy interval-graph colouring. Sorting is fully deterministic so a
// refetch can't reshuffle lanes and make bars jump.

import { eachDay } from '@/lib/scheduleDates'

export type SpanKind = 'estimate_visit' | 'install' | 'custom'

export type SpanInput = {
  /** Unique across kinds — callers should use `${kind}:${id}`. */
  id: string
  kind: SpanKind
  /** Inclusive. */
  startYmd: string
  /** Inclusive. Equal to startYmd for a point event. */
  endYmd: string
}

export type Segment = {
  id: string
  kind: SpanKind
  /** Stable for the whole span. */
  lane: number
  isStart: boolean
  isEnd: boolean
  /** 1-based position within the span, for "Day 3 of 5". */
  dayIndex: number
  spanDays: number
}

/** Longer, more permanent things get the top lanes. */
const KIND_PRIORITY: Record<SpanKind, number> = {
  install: 0,
  custom: 1,
  estimate_visit: 2,
}

function compareSpans(a: SpanInput, b: SpanInput): number {
  if (a.startYmd !== b.startYmd) return a.startYmd < b.startYmd ? -1 : 1
  // Longest first, so the bars that most need to stay continuous claim a lane
  // before the short ones fragment the space.
  if (a.endYmd !== b.endYmd) return a.endYmd > b.endYmd ? -1 : 1
  const ka = KIND_PRIORITY[a.kind] ?? 9
  const kb = KIND_PRIORITY[b.kind] ?? 9
  if (ka !== kb) return ka - kb
  // Final tiebreak on id keeps lane assignment identical across refetches.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Map every day a span touches to the segments sitting on it.
 * Days with no spans are simply absent from the map.
 */
export function buildDayLayout(spans: SpanInput[]): Map<string, Segment[]> {
  const byDay = new Map<string, Segment[]>()
  // laneEnd[i] = the last ymd lane i is occupied through.
  const laneEnd: string[] = []

  for (const span of [...spans].sort(compareSpans)) {
    const start = span.startYmd
    const end = span.endYmd >= span.startYmd ? span.endYmd : span.startYmd

    let lane = laneEnd.findIndex((occupiedThrough) => occupiedThrough < start)
    if (lane === -1) lane = laneEnd.length
    laneEnd[lane] = end

    const days = eachDay(start, end)
    days.forEach((day, i) => {
      const seg: Segment = {
        id: span.id,
        kind: span.kind,
        lane,
        isStart: i === 0,
        isEnd: i === days.length - 1,
        dayIndex: i + 1,
        spanDays: days.length,
      }
      const existing = byDay.get(day)
      if (existing) existing.push(seg)
      else byDay.set(day, [seg])
    })
  }

  for (const segs of byDay.values()) segs.sort((a, b) => a.lane - b.lane)
  return byDay
}

/** Highest lane index actually used on a day, or -1 when the day is empty. */
export function maxLaneOn(segments: Segment[] | undefined): number {
  if (!segments || segments.length === 0) return -1
  return segments.reduce((n, s) => (s.lane > n ? s.lane : n), 0)
}
