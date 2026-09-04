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
import { Loader2, X, Trash2, MapPin, Phone, Mail, ExternalLink, AlertTriangle } from 'lucide-react'
import { toast } from '@/components/Toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import type { JobPickerOption } from '@/lib/jobPicker'
import JobPicker from './JobPicker'
import DurationPicker from './DurationPicker'
import { deriveScheduledEnd } from '@/lib/jobScheduling'
import { endFromSpan, spanDays } from '@/lib/scheduleDates'
import {
  GC_DEPOSIT_PCT,
  RETAIL_DEPOSIT_PCT,
  depositRateLabel,
  looksLikeGc,
  money,
  recordedDeposit,
  requiredDeposit,
} from '@/lib/depositGate'

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
  jobs: JobPickerOption[]
  // When set, the modal opens in re-schedule mode (job locked, dates pre-filled).
  // Omit/null to open in "schedule a new install" mode.
  install?: ExistingInstall | null
  // Default start date for new scheduling (e.g. cell the user clicked).
  defaultStart?: string | null
  // Pre-loaded deposit-gate refusal, set when a drag-to-move on the calendar
  // came back 409. A gesture cannot render the override panel itself, so it
  // hands the user this modal with the block already showing.
  initialGateBlock?: string | null
  // Called after a successful save or delete — calendar uses this to refetch.
  onSaved: () => void
}

export default function ScheduleInstallModal({
  open,
  onClose,
  jobs,
  install = null,
  defaultStart = null,
  initialGateBlock = null,
  onSaved,
}: Props) {
  const isReschedule = Boolean(install)
  const [jobId, setJobId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  // Deposit gate. A toast is the wrong surface for a refusal — it disappears
  // before you've read the number. Both of these render as a persistent panel.
  const [gateBlock, setGateBlock] = useState<string | null>(null)
  const [overrideReason, setOverrideReason] = useState('')
  const firstFieldRef = useRef<HTMLInputElement | null>(null)
  // Once Vince sets a duration himself, stop deriving one from estimated_days.
  // Mirrors deriveScheduledEnd's own "never overwrite Vince's manual choice".
  const spanTouchedRef = useRef(false)

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
    setGateBlock(initialGateBlock ?? null)
    setOverrideReason('')
    spanTouchedRef.current = false
    const t = setTimeout(() => firstFieldRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [open, install, defaultStart, initialGateBlock])

  // Selected job (for the customer-detail panel + linking validation).
  const selectedJob = jobs.find((j) => j.id === jobId) ?? null

  // Picking a job pre-fills the duration from its estimated_days, so the
  // calendar already reads "Mon → Wed · 3 days" before Vince touches anything.
  // Passing currentEnd: null is deliberate — the guard against overwriting a
  // manual choice is spanTouchedRef, which is more precise here than "is an
  // end date already set" (one is always set, from the reset effect).
  useEffect(() => {
    if (isReschedule || spanTouchedRef.current) return
    if (!jobId || !startDate) return
    const job = jobs.find((j) => j.id === jobId)
    const derived = deriveScheduledEnd(startDate, job?.estimated_days, null)
    setEndDate(derived ?? startDate)
  }, [jobId, startDate, isReschedule, jobs])

  if (!open) return null

  // Moving the start moves the whole block. The previous version only
  // bumped the end when it fell behind the start, which silently turned a
  // 5-day install into a 1-day one whenever the start was pushed forward.
  // Same rule as drag-to-move on the calendar: length is preserved.
  function onStartChange(v: string) {
    if (!v) { setStartDate(v); return }
    const span = spanDays(startDate || v, endDate || startDate || v)
    setStartDate(v)
    setEndDate(endFromSpan(v, span))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!jobId) { toast('Pick a job to schedule', 'error'); return }
    if (!startDate) { toast('Start date is required', 'error'); return }
    if (endDate && endDate < startDate) {
      toast('End date can\'t be before start date', 'error'); return
    }

    setSaving(true)
    setGateBlock(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_start: startDate,
          scheduled_end: endDate || startDate,
          ...(overrideReason.trim()
            ? { override_deposit_gate: true, override_deposit_reason: overrideReason.trim() }
            : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      // 409 is the deposit gate, not a failure — the job is untouched and the
      // fix is a specific dollar amount, so it stays on screen instead of
      // flashing past in a toast.
      if (res.status === 409) {
        setGateBlock(data.error || 'This job needs its deposit recorded before it can be scheduled.')
        return
      }
      if (!res.ok) throw new Error(data.error || 'Save failed')
      if (data.deposit_warning?.message) {
        toast(data.deposit_warning.message, 'error')
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
            <JobPicker
              jobs={jobs}
              value={jobId}
              onChange={(id) => setJobId(id)}
              label="Job"
              emptyHint="No jobs available. Accept an estimate first."
            />
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Start date</label>
            <input
              ref={isReschedule ? firstFieldRef : null}
              type="date"
              value={startDate}
              onChange={(e) => onStartChange(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>

          <DurationPicker
            startYmd={startDate}
            endYmd={endDate || startDate}
            onChangeEnd={(ymd) => {
              spanTouchedRef.current = true
              setEndDate(ymd)
            }}
            suggestedDays={selectedJob?.estimated_days ?? null}
          />

          {/* Deposit status for the job being scheduled. Shown BEFORE saving so
              the ask happens while the customer is still on the phone, rather
              than after the date is already promised. */}
          {selectedJob && <DepositStatus job={selectedJob} />}

          {gateBlock && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                <p className="text-sm text-red-800">{gateBlock}</p>
              </div>
              <label className="block text-[11px] font-medium text-red-800">
                Schedule anyway — why?
                <input
                  type="text"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Aaron pays on completion, 6 jobs, never missed"
                  className="mt-1 w-full px-3 py-2 border border-red-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </label>
              <p className="text-[11px] text-red-700">
                An override is logged to the job&apos;s crew log with your name. Leave it
                blank and record the deposit instead.
              </p>
            </div>
          )}

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

// Client-side preview of the same rule the API enforces. It uses the display-name
// heuristic for "is this a GC?" because the jobs list doesn't carry the customer
// row; the server re-checks against customers.is_gc and is the authority. Worst
// case this panel is optimistic and the save comes back 409 — never the reverse,
// since the server's rule is the stricter one.
function DepositStatus({ job }: { job: JobPickerOption }) {
  const isGc = looksLikeGc(job.client_name)
  const required = requiredDeposit({ ...job, is_gc: isGc })
  const recorded = recordedDeposit(job)
  if (required <= 0) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
        No estimate total on this job, so no deposit can be calculated. Price it before
        it holds a date.
      </div>
    )
  }
  const short = Math.max(0, Math.round((required - recorded) * 100) / 100)

  if (short <= 1) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-[11px] text-green-800">
        Deposit on file: {money(recorded)}. Good to schedule.
      </div>
    )
  }
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 space-y-1">
      <p className="text-[11px] font-semibold text-amber-900">
        {isGc ? `GC job — ${depositRateLabel(GC_DEPOSIT_PCT)}` : depositRateLabel(RETAIL_DEPOSIT_PCT)}{' '}
        deposit due: {money(required)} · recorded {money(recorded)} · {money(short)} short
      </p>
      <p className="text-[11px] text-amber-800">
        If they already paid through the estimate link, record it on the job first —
        the Stripe deposit webhook has not written to the CRM since March, so{' '}
        <span className="font-medium">$0.00 here does not mean unpaid</span>.
      </p>
    </div>
  )
}

function CustomerDetails({ job }: { job: JobPickerOption }) {
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
          href={`/dashboard/leads/${job.id}`}
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
