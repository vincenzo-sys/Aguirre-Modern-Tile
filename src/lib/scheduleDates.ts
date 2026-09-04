// Calendar date math on YYYY-MM-DD strings.
//
// Three copies of this used to live in CalendarView, ScheduleCalendar and
// TimelineView, and one of them was wrong: CalendarView's shiftDate built a
// LOCAL midnight Date and then read it back with `.toISOString().slice(0,10)`,
// which is only correct at UTC-5. In any UTC+ zone it returned the previous
// day. Nothing here may use toISOString for a date-only value — always read
// local getters back out, the way jobScheduling.ts does.
//
// Everything is inclusive of both endpoints, matching jobs.scheduled_end and
// deriveScheduledEnd(). The iCal feed (src/lib/ics.ts) adds a day to build an
// exclusive DTEND, so flipping this convention would shift every install in
// Vince's phone calendar by one day.

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local date -> YYYY-MM-DD. Never via toISOString. */
export function ymdOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** YYYY-MM-DD -> Date at LOCAL midnight. Returns null on anything unparseable. */
export function parseYmd(ymd: string | null | undefined): Date | null {
  if (!ymd) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

export function todayYmd(): string {
  return ymdOf(new Date())
}

/**
 * Whole days from `a` to `b` (negative if b is earlier). Math.round, not
 * floor: a span crossing a DST boundary is 23 or 25 hours long, and flooring
 * that turns a 3-day install into a 2-day one every March.
 */
export function daysBetween(a: string, b: string): number {
  const from = parseYmd(a)
  const to = parseYmd(b)
  if (!from || !to) return 0
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

/** Move a YYYY-MM-DD by n days (n may be negative). */
export function shiftDate(ymd: string, n: number): string {
  const d = parseYmd(ymd)
  if (!d) return ymd
  d.setDate(d.getDate() + n)
  return ymdOf(d)
}

/** Inclusive length of a span. A null/blank/earlier end means a single day. */
export function spanDays(start: string, end: string | null | undefined): number {
  if (!end) return 1
  const n = daysBetween(start, end) + 1
  return n < 1 ? 1 : n
}

/** Inverse of spanDays: the inclusive end date of an n-day span starting at `start`. */
export function endFromSpan(start: string, days: number): string {
  const n = Number.isFinite(days) ? Math.max(1, Math.ceil(days)) : 1
  return shiftDate(start, n - 1)
}

/** Every YYYY-MM-DD from start to end inclusive. Bounded so bad input can't hang the UI. */
export function eachDay(start: string, end: string, maxDays = 400): string[] {
  const out: string[] = []
  const from = parseYmd(start)
  if (!from) return out
  const last = parseYmd(end) ?? from
  const cursor = new Date(from)
  while (cursor <= last && out.length < maxDays) {
    out.push(ymdOf(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  if (out.length === 0) out.push(ymdOf(from))
  return out
}

/** "Sep 8" — the short form used in picker subtitles and toasts. */
export function formatDayShort(ymd: string): string {
  const d = parseYmd(ymd)
  if (!d) return ymd
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "Mon Sep 8" — with a weekday, for the duration summary line. */
export function formatDayWithWeekday(ymd: string): string {
  const d = parseYmd(ymd)
  if (!d) return ymd
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * Live summary under the duration chips.
 *   1 day  -> "Mon Sep 8 · 1 day"
 *   n days -> "Mon Sep 8 → Fri Sep 12 · 5 days"
 */
export function formatSpan(start: string, end: string | null | undefined): string {
  const n = spanDays(start, end)
  if (n <= 1 || !end) return `${formatDayWithWeekday(start)} · 1 day`
  return `${formatDayWithWeekday(start)} → ${formatDayWithWeekday(end)} · ${n} days`
}

/** "Sep 8 – Sep 12" / "Sep 8". Compact range for list rows. */
export function formatRangeShort(start: string, end: string | null | undefined): string {
  if (!end || end === start) return formatDayShort(start)
  return `${formatDayShort(start)} – ${formatDayShort(end)}`
}
