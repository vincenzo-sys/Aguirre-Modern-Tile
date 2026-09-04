'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { CalendarEvent, JobWithAssignee } from '@/lib/supabase/types'
import { jobStatusMeta } from '@/lib/jobStatus'
import AddEventModal from './AddEventModal'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysBetween(from: string, to: string): number {
  const fromTime = new Date(from + 'T00:00:00').getTime()
  const toTime = new Date(to + 'T00:00:00').getTime()
  return Math.round((toTime - fromTime) / 86_400_000)
}

function shiftDate(dateStr: string, deltaDays: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

// Convert an event's timestamptz into local YYYY-MM-DD so we can index events
// by day cell. Has to happen in the user's timezone, which is what `new Date`
// gives us by default.
function localDateKey(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).replace(' ', '').toLowerCase()
}

export default function CalendarView({ jobs: initialJobs }: { jobs: JobWithAssignee[] }) {
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [jobs, setJobs] = useState(initialJobs)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [modalDefaultDate, setModalDefaultDate] = useState<string | null>(null)

  useEffect(() => {
    setJobs(initialJobs)
  }, [initialJobs])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startOffset = firstDay.getDay()
  const daysInMonth = lastDay.getDate()

  const today = new Date()
  const isThisMonth = today.getFullYear() === year && today.getMonth() === month

  // Refetch events whenever the visible month changes. Window is the calendar
  // grid (incl. trailing/leading days from adjacent months) padded by a day
  // to be safe on timezone edges.
  useEffect(() => {
    const from = new Date(year, month, 1).toISOString()
    const to = new Date(year, month + 1, 1).toISOString()

    let cancelled = false
    fetch(`/api/calendar-events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setEvents(data)
      })
      .catch(() => { /* swallow — calendar still works without events */ })
    return () => { cancelled = true }
  }, [year, month])

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1))
  }
  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1))
  }
  function goToday() {
    setCurrentDate(new Date())
  }

  function getJobsForDay(day: number) {
    const dateStr = formatDate(year, month, day)
    return jobs.filter((j) => {
      if (!j.scheduled_start) return false
      const start = j.scheduled_start
      const end = j.scheduled_end || j.scheduled_start
      return dateStr >= start && dateStr <= end
    })
  }

  function getEventsForDay(day: number) {
    const dateStr = formatDate(year, month, day)
    return events.filter((e) => {
      const start = localDateKey(e.start_at)
      const end = e.end_at ? localDateKey(e.end_at) : start
      return dateStr >= start && dateStr <= end
    })
  }

  function openAddEvent(dateStr: string | null) {
    setEditingEvent(null)
    setModalDefaultDate(dateStr)
    setModalOpen(true)
  }

  function openEditEvent(ev: CalendarEvent) {
    setEditingEvent(ev)
    setModalDefaultDate(null)
    setModalOpen(true)
  }

  function handleSaved(saved: CalendarEvent) {
    setEvents((prev) => {
      const idx = prev.findIndex((e) => e.id === saved.id)
      if (idx === -1) return [...prev, saved].sort((a, b) => a.start_at.localeCompare(b.start_at))
      const next = prev.slice()
      next[idx] = saved
      return next
    })
  }

  function handleDeleted(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id))
  }

  async function rescheduleJob(jobId: string, targetDate: string) {
    const job = jobs.find((j) => j.id === jobId)
    if (!job || !job.scheduled_start) return

    if (job.scheduled_start === targetDate) return

    const duration = job.scheduled_end ? daysBetween(job.scheduled_start, job.scheduled_end) : 0
    const newStart = targetDate
    const newEnd = duration > 0 ? shiftDate(targetDate, duration) : null

    const originalJobs = jobs
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId ? { ...j, scheduled_start: newStart, scheduled_end: newEnd } : j
      )
    )

    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_start: newStart, scheduled_end: newEnd }),
      })
      if (!res.ok) throw new Error('Failed to reschedule')
      toast(`Rescheduled to ${new Date(targetDate + 'T00:00:00').toLocaleDateString()}`)
      router.refresh()
    } catch (err) {
      console.error(err)
      setJobs(originalJobs)
      toast('Failed to reschedule — reverted', 'error')
    }
  }

  const cells: (number | null)[] = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-gray-900">
          {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openAddEvent(null)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-semibold text-white bg-primary-600 rounded-md hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add event</span>
            <span className="sm:hidden">Event</span>
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Today
          </button>
          <button onClick={prevMonth} className="p-1 rounded-md hover:bg-gray-100" aria-label="Previous month">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <button onClick={nextMonth} className="p-1 rounded-md hover:bg-gray-100" aria-label="Next month">
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-2">
        Drag any job to a different day to reschedule. Tap a blank day to add an event.
      </p>

      <div className="grid grid-cols-7 border border-gray-200 rounded-lg overflow-hidden">
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            className="bg-gray-50 border-b border-gray-200 px-2 py-2 text-xs font-semibold text-gray-500 text-center"
          >
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          const dateStr = day ? formatDate(year, month, day) : null
          const isToday = isThisMonth && day === today.getDate()
          const dayJobs = day ? getJobsForDay(day) : []
          const dayEvents = day ? getEventsForDay(day) : []
          const isDropTarget = dateStr !== null && dragOverDate === dateStr
          const totalItems = dayJobs.length + dayEvents.length
          // Reserve a few slots for events first when both compete for space —
          // ad-hoc events are usually the time-sensitive thing Vince just
          // added, so they should be the ones that don't get truncated.
          const eventBudget = Math.min(dayEvents.length, 2)
          const jobBudget = Math.max(0, 3 - eventBudget)

          return (
            <div
              key={i}
              onDragOver={(e) => {
                if (!dateStr || !draggingId) return
                e.preventDefault()
                if (dragOverDate !== dateStr) setDragOverDate(dateStr)
              }}
              onDragLeave={() => {
                if (dragOverDate === dateStr) setDragOverDate(null)
              }}
              onDrop={(e) => {
                if (!dateStr || !draggingId) return
                e.preventDefault()
                const jobId = e.dataTransfer.getData('text/job-id') || draggingId
                rescheduleJob(jobId, dateStr)
                setDragOverDate(null)
                setDraggingId(null)
              }}
              onClick={(e) => {
                // Only treat clicks on empty space (not on a pill) as
                // "add event for this day". Buttons inside the cell stop
                // propagation via their own handlers.
                if (!dateStr) return
                if (e.target === e.currentTarget) openAddEvent(dateStr)
              }}
              className={`min-h-[80px] sm:min-h-[100px] border-b border-r border-gray-200 p-1 transition-colors ${
                day ? 'bg-white cursor-pointer' : 'bg-gray-50'
              } ${isDropTarget ? 'bg-primary-50 ring-2 ring-primary-400 ring-inset' : ''}`}
            >
              {day && (
                <>
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full pointer-events-none ${
                      isToday ? 'bg-primary-600 text-white' : 'text-gray-700'
                    }`}
                  >
                    {day}
                  </span>
                  <div className="mt-0.5 space-y-0.5">
                    {dayEvents.slice(0, eventBudget).map((ev) => (
                      <button
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditEvent(ev)
                        }}
                        className="block w-full text-left truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight bg-white border border-primary-300 text-primary-800 hover:bg-primary-50"
                        title={ev.notes || ev.title}
                      >
                        {!ev.all_day && (
                          <span className="font-semibold mr-1">{formatEventTime(ev.start_at)}</span>
                        )}
                        {ev.title}
                      </button>
                    ))}
                    {dayJobs.slice(0, jobBudget).map((j) => (
                      <button
                        key={j.id}
                        draggable
                        onDragStart={(e) => {
                          setDraggingId(j.id)
                          e.dataTransfer.setData('text/job-id', j.id)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragEnd={() => {
                          setDraggingId(null)
                          setDragOverDate(null)
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/dashboard/leads/${j.id}`)
                        }}
                        className={`block w-full text-left truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight cursor-grab active:cursor-grabbing ${jobStatusMeta(j.status).chip} hover:opacity-80 ${
                          draggingId === j.id ? 'opacity-40' : ''
                        }`}
                      >
                        {j.title}
                      </button>
                    ))}
                    {totalItems > eventBudget + jobBudget && (
                      <p className="text-[10px] text-gray-400 px-1 pointer-events-none">
                        +{totalItems - eventBudget - jobBudget} more
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <AddEventModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        event={editingEvent}
        defaultDate={modalDefaultDate}
        jobs={jobs}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </div>
  )
}
