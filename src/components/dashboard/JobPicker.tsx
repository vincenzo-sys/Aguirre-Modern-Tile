'use client'

// The "link to job" / "pick a job" control, shared by AddEventModal and
// ScheduleInstallModal so the two can't drift again (they previously had two
// copies of the same `<select>` and the same option label).
//
// It replaces a plain <select> holding up to 100 options labelled
// "#92 Bathroom — Vince" with no date on them, which is why Vince couldn't
// tell last year's work from next week's. Rows here carry a status pill and
// the scheduled dates, and the list is grouped so the jobs that need a date
// come first. Grouping and search live in src/lib/jobPicker.ts.
//
// Filtering is client-side on purpose. There are ~114 jobs, GET /api/jobs has
// no search param, and both parent modals do `jobs.find(j => j.id === jobId)`
// to render their customer/deposit panels — a server-backed list would
// routinely not contain the selected job. See ReferrerPicker for the same call.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, Check, ChevronDown } from 'lucide-react'
import { jobStatusMeta } from '@/lib/jobStatus'
import { todayYmd } from '@/lib/scheduleDates'
import {
  BUCKET_LABEL,
  BUCKET_ORDER,
  countJobs,
  firstMatch,
  groupJobsForPicker,
  jobPickerSubtitle,
  normalizeQuery,
  type JobBucket,
  type JobPickerOption,
} from '@/lib/jobPicker'

type Props = {
  jobs: JobPickerOption[]
  value: string
  onChange: (id: string, job: JobPickerOption | null) => void
  label: string
  /** Offer a "— None —" row. True for linking an event, false for scheduling one. */
  allowNone?: boolean
  placeholder?: string
  hint?: string
  /** Rendered under the label when there are no jobs at all. */
  emptyHint?: string
}

export default function JobPicker({
  jobs,
  value,
  onChange,
  label,
  allowNone = false,
  placeholder = 'Search job #, name, or address',
  hint,
  emptyHint,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // The archive is collapsed by default so the list doesn't open on old work —
  // the original complaint. A search always spans it, so searching expands it.
  const [showArchive, setShowArchive] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = useMemo(
    () => jobs.find((j) => j.id === value) ?? null,
    [jobs, value],
  )

  const grouped = useMemo(
    () => groupJobsForPicker(jobs, todayYmd(), query),
    [jobs, query],
  )

  const searching = normalizeQuery(query).length > 0
  const archiveOpen = searching || showArchive
  const total = countJobs(grouped)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setShowArchive(false)
    // Same trick as AddEventModal: the input is behind a transition on first
    // paint, so focus has to wait a tick to actually land.
    const t = setTimeout(() => searchRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function choose(job: JobPickerOption | null) {
    onChange(job?.id ?? '', job)
    setOpen(false)
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>

      {/* type="button" everywhere in this component — it renders inside the
          parent modal's <form>, and a bare <button> would submit it. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full min-h-[44px] flex items-center justify-between gap-2 px-3 py-2 border border-gray-300 rounded-md bg-white text-left focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {selected ? (
          <span className="min-w-0">
            <span className="block text-sm text-gray-900 truncate">
              <span className="font-mono font-semibold">#{selected.job_number}</span>{' '}
              {selected.title} — {selected.client_name}
            </span>
            <span className="block text-[11px] text-gray-500 truncate">
              {jobStatusMeta(selected.status).label} · {jobPickerSubtitle(selected)}
            </span>
          </span>
        ) : (
          <span className="text-sm text-gray-500">
            {jobs.length === 0 ? 'No jobs available' : allowNone ? '— None —' : 'Pick a job'}
          </span>
        )}
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </button>

      {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
      {jobs.length === 0 && emptyHint && (
        <p className="text-[11px] text-gray-500 mt-1">{emptyHint}</p>
      )}

      {open && (
        // z-[60] because both parent modals sit at z-50.
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] flex flex-col">
            <div className="sticky top-0 bg-white border-b border-gray-200 rounded-t-2xl">
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900">{label}</h4>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1 rounded-md hover:bg-gray-100"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="px-4 pb-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={searchRef}
                    type="text"
                    inputMode="search"
                    autoComplete="off"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      // Without this, Enter bubbles to the parent <form> and
                      // saves a half-filled event instead of picking a job.
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const hit = firstMatch(grouped)
                        if (hit) choose(hit)
                      }
                    }}
                    placeholder={placeholder}
                    className="w-full min-h-[44px] pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 pb-2">
              {allowNone && !searching && (
                <button
                  type="button"
                  onClick={() => choose(null)}
                  className="w-full min-h-[44px] px-4 py-2.5 text-left text-sm text-gray-600 active:bg-gray-50 hover:bg-gray-50 flex items-center justify-between"
                >
                  — None —
                  {!value && <Check className="w-4 h-4 text-primary-600" />}
                </button>
              )}

              {total === 0 && (
                <p className="px-4 py-8 text-center text-sm text-gray-500">
                  {jobs.length === 0
                    ? 'No jobs yet.'
                    : `Nothing matches “${query.trim()}”.`}
                </p>
              )}

              {BUCKET_ORDER.map((bucket) => {
                const rows = grouped[bucket]
                if (rows.length === 0) return null
                const collapsed = bucket === 'archive' && !archiveOpen
                return (
                  <div key={bucket}>
                    {bucket === 'archive' ? (
                      <button
                        type="button"
                        onClick={() => setShowArchive((v) => !v)}
                        className="w-full sticky top-0 bg-gray-50 px-4 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 border-y border-gray-100 flex items-center justify-between"
                      >
                        <span>
                          {collapsed ? `Show ${rows.length} older job${rows.length === 1 ? '' : 's'}` : BUCKET_LABEL[bucket]}
                        </span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform ${collapsed ? '' : 'rotate-180'}`}
                        />
                      </button>
                    ) : (
                      <div className="sticky top-0 bg-gray-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 border-y border-gray-100">
                        {BUCKET_LABEL[bucket]} ({rows.length})
                      </div>
                    )}
                    {!collapsed &&
                      rows.map((job) => (
                        <JobRow
                          key={job.id}
                          job={job}
                          selected={job.id === value}
                          onPick={() => choose(job)}
                        />
                      ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function JobRow({
  job,
  selected,
  onPick,
}: {
  job: JobPickerOption
  selected: boolean
  onPick: () => void
}) {
  const meta = jobStatusMeta(job.status)
  return (
    <button
      type="button"
      onClick={onPick}
      className={`w-full min-h-[44px] px-4 py-2.5 text-left border-b border-gray-50 active:bg-gray-50 hover:bg-gray-50 flex items-center gap-2 ${
        selected ? 'bg-primary-50' : ''
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-gray-900 truncate">
          <span className="font-mono font-semibold">#{job.job_number}</span> {job.title}
          {' — '}
          <span className="text-gray-600">{job.client_name}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${meta.badge}`}>
            {meta.label}
          </span>
          <span className="text-[11px] text-gray-500">{jobPickerSubtitle(job)}</span>
        </span>
      </span>
      {selected && <Check className="w-4 h-4 text-primary-600 shrink-0" />}
    </button>
  )
}
