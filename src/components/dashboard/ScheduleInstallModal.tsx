'use client'

// ScheduleInstallModal — quick way to put an existing job on the calendar
// (or move/re-span one) without leaving /schedule.
//
// Two distinct flows live in this component:
//   1. New scheduling (no `install` prop): pick a job from the dropdown,
//      pick a date range. Save PATCHes jobs.scheduled_start +
//      scheduled_end. Default end date == start date (single-day install).
//   2. Re-schedule (passed `install` prop = an existing install on the
//      calendar): job is fixed (label only), date pickers pre-fill from
//      the install's current start/end. Save PATCHes the same fields;
//      Delete clears scheduled_start so it falls off the calendar.
//
// We deliberately do NOT touch jobs.status here. Putting a job on the
// calendar doesn't mean "advance to scheduled" because jobs in
// in_progress / completed / waiting_for_materials all keep their own
// scheduled dates. The status is changed via the Leads kanban or the
// job detail page.

import { useEffect, useRef, useState } from 'react'
import { Loader2, X, Trash2, MapPin, Phone, Mail, ExternalLink } from 'lucide-react'
import { toast } from '@/components/Toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import type { JobWithAssignee } from '@/lib/supabase/types'

type ExistingInstall = {
  id: string
  job_number: number
  title: string
  start: string  // YMD
  end: string    // YMD
}

type Props = {
  open: boolean
  onClose: () => void
  jobs: JobWithAssignee[]
  // When set, the modal opens in re-schedule mode (job locked, dates pre-filled).
  // Omit/null to open in "schedule a new install" mode.
  install?: ExistingInstall | null
  // Default start date for new scheduling (e.g. cell the user clicked).
  defaultStart?: string | null
  // Called after a successful save or delete — calendar uses this to refetch.
  onSaved: () => void
}

export default function ScheduleInstallModal({
  open,
  onClose,
  jobs,
  install = null,
  defaultStart = null,
  onSaved,
}: Props) {
  const isReschedule = Boolean(install)
  const [jobId, setJobId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const firstFieldRef = useRef<HTMLSelectElement | HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    if (install) {
      setJobId(install.id)
      setStartDate(install.start.slice(0, 10))
      setEndDate(install.end.slice(0, 10))
    } else {
      setJobId('')
      const initialStart = defaultStart ?? new Date().toISOString().slice(0, 10)
      setStartDate(initialStart)
      setEndDate(initialStart)
    }
    const t = setTimeout(() => firstFieldRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [open, install, defaultStart])

  // Selected job (for the customer-detail panel + linking validation).
  const selectedJob = jobs.find((j) => j.id === jobId) ?? null

  if (!open) return null

  // Keep end-date >= start-date as the user edits. If they push start past
  // end, auto-bump end to match (instead of throwing a validation toast).
  function onStartChange(v: string) {
    setStartDate(v)
    if (endDate < v) setEndDate(v)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!jobId) { toast('Pick a job to schedule', 'error'); return }
    if (!startDate) { toast('Start date is required', 'error'); return }
    if (endDate && endDate < startDate) {
      toast('End date can\'t be before start date', 'error'); return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_start: startDate,
          scheduled_end: endDate || startDate,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Save failed')
      }
      toast(isReschedule ? 'Install re-scheduled' : 'Install scheduled', 'success')
      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      toast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Re-schedule mode only: clear the schedule so the job drops off the calendar.
  // Doesn't archive or change status — Vince can re-schedule via this same flow.
  async function handleClear() {
    if (!install) return
    if (!(await confirmDialog({
      title: 'Remove this install from the calendar?',
      message: 'The job stays in its current status — only the scheduled dates are cleared.',
      tone: 'danger',
      confirmLabel: 'Remove',
    }))) return
    setClearing(true)
    try {
      const res = await fetch(`/api/jobs/${install.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_start: null, scheduled_end: null }),
      })
      if (!res.ok) throw new Error('Clear failed')
      toast('Removed from calendar', 'success')
      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      toast('Clear failed', 'error')
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {isReschedule ? 'Re-schedule install' : 'Schedule install'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {isReschedule && install ? (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
              <span className="font-semibold">#{install.job_number}</span>{' '}
              {install.title}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Job</label>
              <select
                ref={firstFieldRef as React.RefObject<HTMLSelectElement>}
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                required
              >
                <option value="">— Pick a job —</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    #{j.job_number} {j.title} — {j.client_name}
                  </option>
                ))}
              </select>
              {jobs.length === 0 && (
                <p className="text-[11px] text-gray-500 mt-1">
                  No active jobs available. Accept an estimate first.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Start date</label>
              <input
                ref={(!isReschedule ? null : firstFieldRef) as React.RefObject<HTMLInputElement> | null}
                type="date"
                value={startDate}
                onChange={(e) => onStartChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-500 -mt-1">
            Single-day install? Leave end date the same as start.
            Multi-day spans render as one bar across cells on the calendar.
          </p>

          {/* Customer details panel — same pattern as AddEventModal. Lets
              Christian see "where am I going / who do I call" without
              leaving the modal. */}
          {selectedJob && (
            <CustomerDetails job={selectedJob} />
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            {isReschedule ? (
              <button
                type="button"
                onClick={handleClear}
                disabled={clearing || saving}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Remove from calendar
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !jobId || !startDate}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {isReschedule ? 'Save' : 'Schedule'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

function CustomerDetails({ job }: { job: JobWithAssignee }) {
  const mapsUrl = job.client_address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.client_address)}`
    : null
  return (
    <div className="rounded-md border border-primary-200 bg-primary-50 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-primary-900">
          {job.client_name}
        </div>
        <a
          href={`/dashboard/jobs/${job.id}`}
          className="inline-flex items-center gap-1 text-[11px] text-primary-700 hover:underline shrink-0"
        >
          Open job
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <div className="text-[11px] text-primary-700">
        #{job.job_number} {job.title}
      </div>
      <div className="flex flex-col gap-1.5 pt-1">
        {job.client_address && (
          <a
            href={mapsUrl ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-start gap-2 text-sm text-primary-800 hover:underline"
          >
            <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="break-words">{job.client_address}</span>
          </a>
        )}
        {job.client_phone && (
          <a
            href={`tel:${job.client_phone}`}
            className="inline-flex items-center gap-2 text-sm text-primary-800 hover:underline"
          >
            <Phone className="w-4 h-4 shrink-0" />
            {job.client_phone}
          </a>
        )}
        {job.client_email && (
          <a
            href={`mailto:${job.client_email}`}
            className="inline-flex items-center gap-2 text-sm text-primary-800 hover:underline break-all"
          >
            <Mail className="w-4 h-4 shrink-0" />
            {job.client_email}
          </a>
        )}
      </div>
    </div>
  )
}
