// One place where a job status becomes something you can look at.
//
// This table used to exist SEVEN times: JobStatusBadge (`statusConfig`),
// CalendarView, CrewWeekView, ScheduleCalendar (`installStatusBg`),
// TimelineView, TodayUpcomingJobs (`statusStyle`) and TeamMapInner. Several
// had already drifted — installStatusBg had no entry for
// accepted_not_scheduled and silently fell back to gray.
//
// The important part of this module is the SHAPE of the accessor, not the
// table. `jobStatusMeta` takes a plain `string`, not a `JobStatus`, and
// always returns something renderable. Postgres can grow the job_status
// enum with `ALTER TYPE ... ADD VALUE` and TypeScript will never notice —
// that is exactly how `awaiting_response` (migration 035) ended up in the
// database but not in the union, one `Record<JobStatus, …>` lookup away
// from throwing "Cannot read properties of undefined" in the UI.
// Anything unrecognised now renders gray with a title-cased label instead.
//
// NB: every class string below must stay a literal. Tailwind's scanner reads
// source text, so a computed `bg-${hue}-200` would never be emitted.

import type { JobStatus } from '@/lib/supabase/types'

export type JobStatusMeta = {
  /** Human label for badges and pickers. */
  label: string
  /** Pill: light fill, dark text. */
  badge: string
  /** Border to pair with `badge` where a card wants an outline. */
  border: string
  /** Calendar bar: stronger fill, hover state. */
  chip: string
  /** Solid bar with no text on it (gantt/timeline). */
  bar: string
  /** Hex, for canvas/SVG consumers that can't take a class — e.g. Leaflet. */
  dot: string
}

export const JOB_STATUS_META: Record<JobStatus, JobStatusMeta> = {
  lead: {
    label: 'Lead',
    badge: 'bg-yellow-100 text-yellow-800',
    border: 'border-yellow-200',
    chip: 'bg-yellow-200 text-yellow-900 hover:bg-yellow-300',
    bar: 'bg-yellow-300',
    dot: '#eab308',
  },
  quoted: {
    label: 'Quoted',
    badge: 'bg-blue-100 text-blue-800',
    border: 'border-blue-200',
    chip: 'bg-blue-200 text-blue-900 hover:bg-blue-300',
    bar: 'bg-blue-300',
    dot: '#3b82f6',
  },
  estimate_revised: {
    label: 'Estimate Revised',
    badge: 'bg-indigo-100 text-indigo-800',
    border: 'border-indigo-200',
    chip: 'bg-indigo-200 text-indigo-900 hover:bg-indigo-300',
    bar: 'bg-indigo-300',
    dot: '#6366f1',
  },
  // Rose rather than the leads board's orange: in the job-status vocabulary
  // orange already means in_progress, and a picker that renders two different
  // statuses identically is the problem this module exists to stop.
  awaiting_response: {
    label: 'Waiting for Response',
    badge: 'bg-rose-100 text-rose-800',
    border: 'border-rose-200',
    chip: 'bg-rose-200 text-rose-900 hover:bg-rose-300',
    bar: 'bg-rose-300',
    dot: '#f43f5e',
  },
  // Sky, not teal/green: accepted means "said yes", not "paid". Green is
  // reserved for money in (the calendar's deposit bar, completed, paid).
  accepted_not_scheduled: {
    label: 'Accepted — Pick Date',
    badge: 'bg-sky-100 text-sky-800',
    border: 'border-sky-200',
    chip: 'bg-sky-200 text-sky-900 hover:bg-sky-300',
    bar: 'bg-sky-300',
    dot: '#0ea5e9',
  },
  scheduled: {
    label: 'Scheduled',
    badge: 'bg-purple-100 text-purple-800',
    border: 'border-purple-200',
    chip: 'bg-purple-200 text-purple-900 hover:bg-purple-300',
    bar: 'bg-purple-300',
    dot: '#a855f7',
  },
  in_progress: {
    label: 'In Progress',
    badge: 'bg-orange-100 text-orange-800',
    border: 'border-orange-200',
    chip: 'bg-orange-200 text-orange-900 hover:bg-orange-300',
    bar: 'bg-orange-300',
    dot: '#f97316',
  },
  waiting_for_materials: {
    label: 'Waiting for Materials',
    badge: 'bg-amber-100 text-amber-800',
    border: 'border-amber-200',
    chip: 'bg-amber-200 text-amber-900 hover:bg-amber-300',
    bar: 'bg-amber-300',
    dot: '#f59e0b',
  },
  completed: {
    label: 'Completed',
    badge: 'bg-green-100 text-green-800',
    border: 'border-green-200',
    chip: 'bg-green-200 text-green-900 hover:bg-green-300',
    bar: 'bg-green-300',
    dot: '#22c55e',
  },
  paid: {
    label: 'Paid',
    badge: 'bg-emerald-100 text-emerald-800',
    border: 'border-emerald-200',
    chip: 'bg-emerald-200 text-emerald-900 hover:bg-emerald-300',
    bar: 'bg-emerald-300',
    dot: '#10b981',
  },
  cancelled: {
    label: 'Cancelled',
    badge: 'bg-gray-100 text-gray-800',
    border: 'border-gray-200',
    chip: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
    bar: 'bg-gray-300',
    // Deliberately gray-400, a shade lighter than the -500s above, so a
    // cancelled job recedes on the team map instead of competing.
    dot: '#9ca3af',
  },
}

const FALLBACK_CLASSES = {
  badge: 'bg-gray-100 text-gray-800',
  border: 'border-gray-200',
  chip: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
  bar: 'bg-gray-300',
  dot: '#9ca3af',
} as const

/** `some_new_status` -> `Some New Status`, so an unmapped enum value still reads. */
function titleCase(raw: string): string {
  return raw
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Look up display metadata for a job status. Deliberately accepts any string:
 * callers routinely hold a status that came straight off a Supabase row, which
 * is typed from a union that the database is free to outgrow.
 */
export function jobStatusMeta(status: string | null | undefined): JobStatusMeta {
  if (!status) {
    return { label: 'Unknown', ...FALLBACK_CLASSES }
  }
  const known = JOB_STATUS_META[status as JobStatus]
  if (known) return known
  return { label: titleCase(status), ...FALLBACK_CLASSES }
}
