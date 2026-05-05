'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, X, Trash2 } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { CalendarEvent, JobWithAssignee } from '@/lib/supabase/types'

// Inputs are kept as separate `date` + `time` strings while the modal is open
// (matching the native <input type="date"> / <input type="time"> contract),
// then merged into a timestamptz on save. Storing them split avoids the
// timezone gotchas of round-tripping a single datetime-local string —
// `new Date('2026-05-05T18:00')` is already in the user's local zone, so we
// can `.toISOString()` it on the way out.
function combineLocal(dateStr: string, timeStr: string): string {
  const safeTime = timeStr || '00:00'
  return new Date(`${dateStr}T${safeTime}`).toISOString()
}

// Inverse of combineLocal — split an ISO timestamp into local YYYY-MM-DD and
// HH:mm so the form fields can be pre-populated when editing.
function splitLocal(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

type Props = {
  open: boolean
  onClose: () => void
  // If `event` is set, the modal opens in edit mode (with delete button).
  event: CalendarEvent | null
  // When the user clicks an empty day, we pre-fill the date.
  defaultDate: string | null
  // Optional list of jobs to offer as a "Link to job" picker.
  jobs?: JobWithAssignee[]
  onSaved: (event: CalendarEvent) => void
  onDeleted: (id: string) => void
}

export default function AddEventModal({
  open,
  onClose,
  event,
  defaultDate,
  jobs = [],
  onSaved,
  onDeleted,
}: Props) {
  const isEdit = Boolean(event)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [jobId, setJobId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    if (event) {
      const start = splitLocal(event.start_at)
      const end = event.end_at ? splitLocal(event.end_at) : null
      setTitle(event.title)
      setDate(start.date)
      setTime(event.all_day ? '' : start.time)
      setEndDate(end?.date ?? '')
      setEndTime(end && !event.all_day ? end.time : '')
      setAllDay(event.all_day)
      setJobId(event.job_id ?? '')
      setNotes(event.notes ?? '')
    } else {
      setTitle('')
      setDate(defaultDate ?? new Date().toISOString().slice(0, 10))
      setTime('')
      setEndDate('')
      setEndTime('')
      setAllDay(false)
      setJobId('')
      setNotes('')
    }
    // Autofocus title once the modal mounts. Small timeout because the input
    // is hidden behind the transition on first paint.
    const t = setTimeout(() => titleRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [open, event, defaultDate])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !date) {
      toast('Title and date are required', 'error')
      return
    }

    setSaving(true)
    try {
      const start_at = combineLocal(date, allDay ? '00:00' : time)
      const end_at = endDate
        ? combineLocal(endDate, allDay ? '23:59' : (endTime || time || '23:59'))
        : null

      const payload = {
        title: title.trim(),
        start_at,
        end_at,
        all_day: allDay,
        job_id: jobId || null,
        notes: notes.trim() || null,
      }

      const url = isEdit ? `/api/calendar-events/${event!.id}` : '/api/calendar-events'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Save failed')
      }
      const saved: CalendarEvent = await res.json()
      onSaved(saved)
      toast(isEdit ? 'Event updated' : 'Event added')
      onClose()
    } catch (err) {
      console.error(err)
      toast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!event) return
    if (!confirm('Delete this event?')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/calendar-events/${event.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      onDeleted(event.id)
      toast('Event deleted')
      onClose()
    } catch (err) {
      console.error(err)
      toast('Delete failed', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit event' : 'Add event'}
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
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Glass door follow-up"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              maxLength={200}
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="all-day"
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="all-day" className="text-sm text-gray-700">All day</label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
            {!allDay && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Time</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            )}
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-primary-600 font-medium select-none">
              Add end date / time (optional)
            </summary>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">End date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              {!allDay && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">End time</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              )}
            </div>
          </details>

          {jobs.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Link to job (optional)
              </label>
              <select
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              >
                <option value="">— None —</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    #{j.job_number} {j.title} — {j.client_name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                Linking pulls the customer&apos;s address and phone so the crew can tap through.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Bring caulk gun, customer is home after 5pm..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {isEdit ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Delete
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
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {isEdit ? 'Save' : 'Add event'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
