// Grouping, searching and labelling for the "link to job" picker.
//
// Why this exists: the schedule page used to hand the modals a list built by
//   .in('status', [...5 statuses including 'completed'])
//   .order('scheduled_start', { ascending: false, nullsFirst: false })
//   .limit(100)
// which is backwards in three ways at once. Completed work floated to the top;
// accepted_not_scheduled jobs — the ones you open the modal to schedule, which
// have scheduled_start = NULL by definition — sank BELOW every completed job,
// where the limit could cut them off entirely; and paid/lead/quoted jobs were
// unlinkable at all. Vince's summary: "the list is all old jobs".
//
// The query now fetches everything and relevance is decided here, where it can
// be tested. Search deliberately spans all three buckets, including the
// collapsed archive — that is what makes "link ALL the jobs" true without
// bringing back a list that opens on last year's work.

import { SCHEDULABLE_STATUSES } from '@/lib/depositGate'
import { formatRangeShort, formatDayShort, spanDays } from '@/lib/scheduleDates'

export type JobPickerOption = {
  id: string
  job_number: number
  title: string
  /** Plain string: the DB enum outgrows the TS union. See lib/jobStatus.ts. */
  status: string
  client_name: string
  client_address: string | null
  client_phone: string | null
  client_email: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  estimated_days: number | null
  estimated_cost: number | string | null
  deposit_paid?: number | string | null
  amount_paid?: number | string | null
}

export type JobBucket = 'needs_date' | 'upcoming' | 'archive'

export const BUCKET_ORDER: JobBucket[] = ['needs_date', 'upcoming', 'archive']

export const BUCKET_LABEL: Record<JobBucket, string> = {
  needs_date: 'Needs a date',
  upcoming: 'Coming up',
  archive: 'Older',
}

/** Terminal states — these never count as "coming up", whatever their dates say. */
const FINISHED = new Set(['completed', 'paid', 'cancelled'])

/**
 * Committed work, imported from the deposit gate rather than re-typed so the
 * picker's idea of "this job is real" can never drift from the gate's.
 */
const SCHEDULABLE = new Set<string>(SCHEDULABLE_STATUSES)

export function bucketJob(job: JobPickerOption, today: string): JobBucket {
  if (SCHEDULABLE.has(job.status) && !job.scheduled_start) return 'needs_date'
  if (FINISHED.has(job.status)) return 'archive'
  const last = job.scheduled_end ?? job.scheduled_start
  if (last && last >= today) return 'upcoming'
  return 'archive'
}

/** lowercase, collapse whitespace, drop a leading '#' so "#92" and "92" agree. */
export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, ' ')
}

export function matchesQuery(job: JobPickerOption, rawQuery: string): boolean {
  const q = normalizeQuery(rawQuery)
  if (!q) return true
  if (String(job.job_number).includes(q)) return true
  const haystack = [job.title, job.client_name, job.client_address]
  return haystack.some((f) => (f ?? '').toLowerCase().includes(q))
}

/**
 * Lower is better. An all-digit query is a job number, so exact and prefix
 * number hits outrank text hits — typing "92" must surface #92, not the four
 * jobs with "92" buried in a street address.
 */
export function matchRank(job: JobPickerOption, rawQuery: string): number {
  const q = normalizeQuery(rawQuery)
  if (!q) return 0
  const num = String(job.job_number)
  if (num === q) return 0
  if (num.startsWith(q)) return 1
  const name = (job.client_name ?? '').toLowerCase()
  const title = (job.title ?? '').toLowerCase()
  if (name.startsWith(q)) return 2
  if (title.startsWith(q)) return 3
  if (name.includes(q) || title.includes(q)) return 4
  return 5
}

function byNumberDesc(a: JobPickerOption, b: JobPickerOption): number {
  return b.job_number - a.job_number
}

function sortWithinBucket(bucket: JobBucket, a: JobPickerOption, b: JobPickerOption): number {
  if (bucket === 'needs_date') return byNumberDesc(a, b)
  if (bucket === 'upcoming') {
    // Soonest first. A missing start sorts last rather than first.
    const as = a.scheduled_start ?? '9999-12-31'
    const bs = b.scheduled_start ?? '9999-12-31'
    if (as !== bs) return as < bs ? -1 : 1
    return byNumberDesc(a, b)
  }
  // archive: most recently scheduled first, then newest job number
  const as = a.scheduled_start ?? ''
  const bs = b.scheduled_start ?? ''
  if (as !== bs) return as > bs ? -1 : 1
  return byNumberDesc(a, b)
}

/**
 * Split into the three display buckets, filtered by `query` and ordered so the
 * most likely pick is first. When a query is present, match quality wins over
 * the bucket's natural ordering.
 */
export function groupJobsForPicker(
  jobs: JobPickerOption[],
  today: string,
  query = '',
): Record<JobBucket, JobPickerOption[]> {
  const out: Record<JobBucket, JobPickerOption[]> = {
    needs_date: [],
    upcoming: [],
    archive: [],
  }
  const q = normalizeQuery(query)
  for (const job of jobs) {
    if (q && !matchesQuery(job, q)) continue
    out[bucketJob(job, today)].push(job)
  }
  for (const bucket of BUCKET_ORDER) {
    out[bucket].sort((a, b) => {
      if (q) {
        const ra = matchRank(a, q)
        const rb = matchRank(b, q)
        if (ra !== rb) return ra - rb
      }
      return sortWithinBucket(bucket, a, b)
    })
  }
  return out
}

/** First result across the buckets, in display order — what Enter selects. */
export function firstMatch(
  grouped: Record<JobBucket, JobPickerOption[]>,
): JobPickerOption | null {
  for (const bucket of BUCKET_ORDER) {
    if (grouped[bucket].length > 0) return grouped[bucket][0]
  }
  return null
}

export function countJobs(grouped: Record<JobBucket, JobPickerOption[]>): number {
  return BUCKET_ORDER.reduce((n, b) => n + grouped[b].length, 0)
}

/**
 * The second line of a picker row — the bit that makes an old job obvious.
 * The dropdown this replaces showed no date at all, so a 2024 job and next
 * week's job were visually identical.
 */
export function jobPickerSubtitle(job: JobPickerOption): string {
  const start = job.scheduled_start
  const end = job.scheduled_end
  if (FINISHED.has(job.status)) {
    const when = end ?? start
    if (job.status === 'cancelled') return 'Cancelled'
    return when ? `Done ${formatDayShort(when)}` : 'No dates'
  }
  if (!start) return 'Not scheduled'
  const n = spanDays(start, end)
  const range = formatRangeShort(start, end)
  return n > 1 ? `${range} · ${n} days` : range
}
