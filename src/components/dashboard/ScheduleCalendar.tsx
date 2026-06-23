'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Clock, GripVertical, Hammer, MapPin, Phone, Plus, Sparkles } from 'lucide-react'
import { toast } from '@/components/Toast'
import AddEventModal from './AddEventModal'
import ScheduleInstallModal from './ScheduleInstallModal'
import type { CalendarEvent, JobWithAssignee } from '@/lib/supabase/types'

type ScheduleEvent =
  | {
      kind: 'estimate_visit'
      id: string
      lead_id: string
      title: string
      start: string
      address: string | null
      phone: string | null
      notes: string | null
    }
  | {
      kind: 'install'
      id: string
      job_number: number
      title: string
      start: string
      end: string
      status: string
      address: string | null
      phone: string | null
    }
  | {
      kind: 'custom'
      id: string
      title: string
      start: string
      end: string | null
      all_day: boolean
      notes: string | null
      job_id: string | null
      address: string | null
      phone: string | null
    }

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const installStatusBg: Record<string, string> = {
  scheduled: 'bg-purple-200 text-purple-900 hover:bg-purple-300',
  in_progress: 'bg-orange-200 text-orange-900 hover:bg-orange-300',
  waiting_for_materials: 'bg-amber-200 text-amber-900 hover:bg-amber-300',
  completed: 'bg-green-200 text-green-900 hover:bg-green-300',
  paid: 'bg-emerald-200 text-emerald-900 hover:bg-emerald-300',
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function ymd(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function dateKeyOf(iso: string): string {
  // For both visits (timestamp) and installs (date), bucket by local date
  return ymd(new Date(iso))
}

function formatVisitTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function startOfWeek(d: Date): Date {
  const out = new Date(d)
  out.setDate(out.getDate() - out.getDay())
  out.setHours(0, 0, 0, 0)
  return out
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

type View = 'month' | 'week' | 'agenda'

export default function ScheduleCalendar({
  jobs = [],
}: {
  jobs?: JobWithAssignee[]
} = {}) {
  const router = useRouter()
  const [view, setView] = useState<View>('month')
  const [cursor, setCursor] = useState<Date>(new Date())
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [modalDefaultDate, setModalDefaultDate] = useState<string | null>(null)
  const [installModalOpen, setInstallModalOpen] = useState(false)
  const [editingInstall, setEditingInstall] = useState<
    { id: string; job_number: number; title: string; start: string; end: string } | null
  >(null)
  // While the user is dragging the right edge of an install bar, this holds
  // the install's id + the live previewed end ymd. The renderer treats the
  // preview as truth so the bar grows/shrinks under the pointer in real time;
  // on pointerup we PATCH the job and refetch. Held in a ref too so the
  // pointerup listener (which captures its closure once) can read the
  // latest value without re-binding.
  const [resizing, setResizing] = useState<{ id: string; previewEndYmd: string } | null>(null)
  const resizingRef = useRef<typeof resizing>(null)
  useEffect(() => { resizingRef.current = resizing }, [resizing])

  // Compute the date window the calendar wants to fetch, based on view + cursor
  const window = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(cursor)
      const end = addDays(start, 6)
      return { from: ymd(start), to: ymd(end) }
    }
    if (view === 'agenda') {
      const start = new Date(cursor)
      start.setHours(0, 0, 0, 0)
      const end = addDays(start, 30)
      return { from: ymd(start), to: ymd(end) }
    }
    // month: include the surrounding days that fill the grid
    const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const lastOfMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    return {
      from: ymd(addDays(firstOfMonth, -firstOfMonth.getDay())),
      to: ymd(addDays(lastOfMonth, 6 - lastOfMonth.getDay())),
    }
  }, [view, cursor])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/schedule?from=${window.from}&to=${window.to}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (!cancelled) setEvents(data.events as ScheduleEvent[])
      })
      .catch(() => {
        if (!cancelled) toast('Failed to load schedule', 'error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [window.from, window.to])

  // For installs (and multi-day custom events) that span multiple days,
  // expand into per-day occurrences so each day in the grid shows the bar.
  // While dragging the right edge of an install, use the preview end date
  // instead of the persisted one so the bar grows under the pointer.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>()
    for (const ev of events) {
      if (ev.kind === 'install') {
        const start = new Date(ev.start + 'T00:00:00')
        const liveEndYmd = resizing?.id === ev.id ? resizing.previewEndYmd : ev.end
        const end = new Date(liveEndYmd + 'T00:00:00')
        for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
          const key = ymd(d)
          if (!map.has(key)) map.set(key, [])
          map.get(key)!.push(ev)
        }
      } else if (ev.kind === 'custom' && ev.end) {
        // Span multi-day custom events across each cell.
        const start = new Date(ev.start)
        const end = new Date(ev.end)
        for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
          const key = ymd(d)
          if (!map.has(key)) map.set(key, [])
          map.get(key)!.push(ev)
        }
      } else {
        const key = dateKeyOf(ev.start)
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(ev)
      }
    }
    return map
  }, [events])

  function shift(direction: -1 | 1) {
    if (view === 'month') {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1))
    } else if (view === 'week') {
      setCursor(addDays(cursor, direction * 7))
    } else {
      setCursor(addDays(cursor, direction * 7))
    }
  }

  function goToday() {
    setCursor(new Date())
  }

  function openEvent(ev: ScheduleEvent) {
    if (ev.kind === 'install') {
      // Re-schedule modal in place instead of a full page nav. The "Open
      // job" link inside the modal still routes to the job detail when
      // Vince needs the full record.
      setEditingInstall({
        id: ev.id,
        job_number: ev.job_number,
        title: ev.title,
        start: ev.start,
        end: ev.end,
      })
      setInstallModalOpen(true)
    } else if (ev.kind === 'estimate_visit') {
      router.push(`/dashboard/leads/${ev.lead_id}`)
    } else {
      // Custom event — open the edit modal in place. We re-hydrate a
      // CalendarEvent shape from the slim ScheduleEvent the API returns.
      setEditingEvent({
        id: ev.id,
        title: ev.title,
        start_at: ev.start,
        end_at: ev.end,
        all_day: ev.all_day,
        job_id: ev.job_id,
        customer_id: null,
        notes: ev.notes,
        color: null,
        created_by: null,
        created_at: '',
        updated_at: '',
      })
      setModalDefaultDate(null)
      setModalOpen(true)
    }
  }

  function openAddEvent() {
    setEditingEvent(null)
    setModalDefaultDate(null)
    setModalOpen(true)
  }

  // Tapping an empty day cell opens the Add Event modal pre-dated to that day.
  function openAddEventOn(dayYmd: string) {
    setEditingEvent(null)
    setModalDefaultDate(dayYmd)
    setModalOpen(true)
  }

  // Drag-resize an install's right edge across day cells. We attach
  // document-level pointer listeners so the drag survives the pointer
  // leaving the original chip element (which shrinks/grows under it).
  // Day cells carry data-day="YYYY-MM-DD"; elementFromPoint lets us look
  // up the day the pointer is currently over.
  function startResizeInstall(installId: string, e: React.PointerEvent<HTMLElement>) {
    e.preventDefault()
    e.stopPropagation()
    const install = events.find((x) => x.kind === 'install' && x.id === installId)
    if (!install || install.kind !== 'install') return
    const originalEnd = install.end
    const startYmd = install.start.slice(0, 10)
    setResizing({ id: installId, previewEndYmd: originalEnd })

    function findDayUnder(x: number, y: number): string | null {
      const stack = document.elementsFromPoint(x, y)
      for (const el of stack) {
        const cell = (el as HTMLElement).closest('[data-day]') as HTMLElement | null
        if (cell?.dataset.day) return cell.dataset.day
      }
      return null
    }

    function onMove(moveEvt: PointerEvent) {
      const dayYmd = findDayUnder(moveEvt.clientX, moveEvt.clientY)
      if (!dayYmd) return
      // Don't allow shrinking before the start day.
      const clamped = dayYmd < startYmd ? startYmd : dayYmd
      setResizing((prev) => (prev && prev.previewEndYmd !== clamped ? { ...prev, previewEndYmd: clamped } : prev))
    }
    async function onUp() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      const final = resizingRef.current?.previewEndYmd
      setResizing(null)
      if (!final || final === originalEnd) return
      // Optimistic local update so the bar holds its new size while the
      // PATCH is in flight (refetch overwrites with server truth on return).
      setEvents((prev) =>
        prev.map((p) => (p.kind === 'install' && p.id === installId ? { ...p, end: final } : p)),
      )
      try {
        const res = await fetch(`/api/jobs/${installId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduled_end: final }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Save failed')
        toast(`Install now ends ${final}`, 'success')
        refetchSchedule()
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Save failed', 'error')
        refetchSchedule()  // pull server truth back
      }
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  // After save/delete, refetch the schedule. Cheaper than maintaining a
  // local optimistic copy of the discriminated union.
  function refetchSchedule() {
    fetch(`/api/schedule?from=${window.from}&to=${window.to}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => setEvents(data.events as ScheduleEvent[]))
      .catch(() => { /* swallow */ })
  }

  const headerLabel = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(cursor)
      const end = addDays(start, 6)
      const sameMonth = start.getMonth() === end.getMonth()
      const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const endStr = end.toLocaleDateString('en-US', {
        month: sameMonth ? undefined : 'short',
        day: 'numeric',
        year: 'numeric',
      })
      return `${startStr} – ${endStr}`
    }
    if (view === 'agenda') {
      return 'Next 30 days'
    }
    return cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }, [view, cursor])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => shift(-1)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
            aria-label="Previous"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => shift(1)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
            aria-label="Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={goToday}
            className="ml-1 px-2 py-1 text-xs font-medium rounded border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            Today
          </button>
          <span className="ml-3 text-sm font-semibold text-gray-900">{headerLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setEditingInstall(null); setInstallModalOpen(true) }}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-primary-700 bg-primary-50 border border-primary-200 rounded hover:bg-primary-100"
          >
            <Hammer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Schedule install</span>
            <span className="sm:hidden">Install</span>
          </button>
          <button
            onClick={openAddEvent}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-primary-600 rounded hover:bg-primary-700"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add event</span>
            <span className="sm:hidden">Event</span>
          </button>
          <div className="flex items-center gap-1 text-xs">
            {(['month', 'week', 'agenda'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 rounded font-medium capitalize ${
                  view === v
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 border-b border-gray-100 flex items-center flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-yellow-400 ring-2 ring-yellow-200" />
          Estimate visit
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-2 rounded-sm bg-purple-300" />
          Install (scheduled)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-2 rounded-sm bg-orange-300" />
          In progress
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-2 rounded-sm bg-white border-2 border-primary-400" />
          Custom event
        </span>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
      ) : view === 'agenda' ? (
        <AgendaView events={events} onOpen={openEvent} />
      ) : view === 'week' ? (
        <WeekGrid cursor={cursor} eventsByDay={eventsByDay} onOpen={openEvent} onCreate={openAddEventOn} onResizeRight={startResizeInstall} resizing={resizing} />
      ) : (
        <MonthGrid cursor={cursor} eventsByDay={eventsByDay} onOpen={openEvent} onCreate={openAddEventOn} onResizeRight={startResizeInstall} resizing={resizing} />
      )}

      <AddEventModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        event={editingEvent}
        defaultDate={modalDefaultDate}
        jobs={jobs}
        onSaved={refetchSchedule}
        onDeleted={refetchSchedule}
      />

      <ScheduleInstallModal
        open={installModalOpen}
        onClose={() => setInstallModalOpen(false)}
        jobs={jobs}
        install={editingInstall}
        defaultStart={modalDefaultDate}
        onSaved={refetchSchedule}
      />
    </div>
  )
}

function MonthGrid({
  cursor,
  eventsByDay,
  onOpen,
  onCreate,
  onResizeRight,
  resizing,
}: {
  cursor: Date
  eventsByDay: Map<string, ScheduleEvent[]>
  onOpen: (ev: ScheduleEvent) => void
  onCreate: (dayYmd: string) => void
  onResizeRight: (installId: string, e: React.PointerEvent<HTMLElement>) => void
  resizing: { id: string; previewEndYmd: string } | null
}) {
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startOffset = firstDay.getDay()
  const daysInMonth = lastDay.getDate()
  const today = ymd(new Date())

  const cells: { key: string; date: Date | null }[] = []
  for (let i = 0; i < startOffset; i++) cells.push({ key: `pad-${i}`, date: null })
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    cells.push({ key: ymd(date), date })
  }

  return (
    <>
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {DAY_NAMES.map((d) => (
          <div key={d} className="px-2 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          if (!cell.date) {
            return <div key={cell.key} className="min-h-[110px] bg-gray-50/50 border-b border-r border-gray-100" />
          }
          const key = ymd(cell.date)
          const dayEvents = eventsByDay.get(key) ?? []
          const isToday = key === today
          return (
            <div
              key={key}
              data-day={key}
              onClick={(e) => {
                // Only treat clicks on empty cell space as "create" — clicks on
                // event chips / links have their own handlers.
                if ((e.target as HTMLElement).closest('button, a')) return
                onCreate(key)
              }}
              className={`min-h-[110px] border-b border-r border-gray-100 p-1.5 flex flex-col gap-1 cursor-pointer hover:bg-gray-50/60 ${
                isToday ? 'bg-primary-50/40' : ''
              }`}
            >
              <span className={`text-xs font-semibold ${isToday ? 'text-primary-700' : 'text-gray-500'}`}>
                {cell.date.getDate()}
              </span>
              <div className="flex flex-col gap-1 overflow-hidden">
                {dayEvents.slice(0, 4).map((ev) => {
                  // The resize handle only renders on the LAST day of an
                  // install's span (using the live preview if dragging).
                  const isLastDayOfInstall = ev.kind === 'install' &&
                    key === (resizing?.id === ev.id ? resizing.previewEndYmd : ev.end.slice(0, 10))
                  return (
                    <EventChip
                      key={`${ev.kind}-${ev.id}`}
                      event={ev}
                      onOpen={onOpen}
                      compact
                      showResizeHandle={isLastDayOfInstall}
                      onResizeStart={isLastDayOfInstall ? (e) => onResizeRight(ev.id, e) : undefined}
                    />
                  )
                })}
                {dayEvents.length > 4 && (
                  <span className="text-[10px] text-gray-500 px-1">+{dayEvents.length - 4} more</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function WeekGrid({
  cursor,
  eventsByDay,
  onOpen,
  onCreate,
  onResizeRight,
  resizing,
}: {
  cursor: Date
  eventsByDay: Map<string, ScheduleEvent[]>
  onOpen: (ev: ScheduleEvent) => void
  onCreate: (dayYmd: string) => void
  onResizeRight: (installId: string, e: React.PointerEvent<HTMLElement>) => void
  resizing: { id: string; previewEndYmd: string } | null
}) {
  const start = startOfWeek(cursor)
  const today = ymd(new Date())

  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: 7 }).map((_, i) => {
        const date = addDays(start, i)
        const key = ymd(date)
        const dayEvents = eventsByDay.get(key) ?? []
        const isToday = key === today
        return (
          <div
            key={key}
            data-day={key}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('button, a')) return
              onCreate(key)
            }}
            className={`flex gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/60 ${isToday ? 'bg-primary-50/40' : ''}`}
          >
            <div className="w-16 shrink-0 text-center">
              <div className="text-[11px] font-semibold text-gray-500 uppercase">
                {date.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div className={`text-2xl font-bold ${isToday ? 'text-primary-700' : 'text-gray-900'}`}>
                {date.getDate()}
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
              {dayEvents.length === 0 ? (
                <span className="text-xs text-gray-300 italic mt-2">Nothing scheduled</span>
              ) : (
                dayEvents.map((ev) => {
                  const isLastDayOfInstall = ev.kind === 'install' &&
                    key === (resizing?.id === ev.id ? resizing.previewEndYmd : ev.end.slice(0, 10))
                  return (
                    <EventChip
                      key={`${ev.kind}-${ev.id}`}
                      event={ev}
                      onOpen={onOpen}
                      showResizeHandle={isLastDayOfInstall}
                      onResizeStart={isLastDayOfInstall ? (e) => onResizeRight(ev.id, e) : undefined}
                    />
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AgendaView({
  events,
  onOpen,
}: {
  events: ScheduleEvent[]
  onOpen: (ev: ScheduleEvent) => void
}) {
  // Group events by their START date (an install only appears under its start day in the agenda)
  const groups = new Map<string, ScheduleEvent[]>()
  for (const ev of events) {
    const key = ev.kind === 'install' ? ev.start : dateKeyOf(ev.start)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(ev)
  }
  const sortedDates = Array.from(groups.keys()).sort()

  if (sortedDates.length === 0) {
    return <div className="p-8 text-center text-gray-400 text-sm">Nothing scheduled in the next 30 days.</div>
  }

  return (
    <div className="divide-y divide-gray-100">
      {sortedDates.map((date) => (
        <div key={date} className="px-4 py-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            {formatLongDate(date)}
          </div>
          <div className="flex flex-col gap-1.5">
            {groups.get(date)!.map((ev) => (
              <EventChip key={`${ev.kind}-${ev.id}`} event={ev} onOpen={onOpen} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function EventChip({
  event,
  onOpen,
  compact = false,
  showResizeHandle = false,
  onResizeStart,
}: {
  event: ScheduleEvent
  onOpen: (ev: ScheduleEvent) => void
  compact?: boolean
  // Set on the LAST day's chip of a multi-day install so the user can grab
  // the right edge and drag-resize across day cells. Calendar parent handles
  // the actual pointer tracking + PATCH.
  showResizeHandle?: boolean
  onResizeStart?: (e: React.PointerEvent<HTMLElement>) => void
}) {
  if (event.kind === 'estimate_visit') {
    const time = formatVisitTime(event.start)
    return (
      <button
        onClick={() => onOpen(event)}
        className={`w-full text-left rounded-md border-2 border-yellow-400 bg-yellow-50 hover:bg-yellow-100 transition-colors text-yellow-900 ${
          compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-3 py-2 text-sm'
        }`}
        title={event.title}
      >
        <div className="flex items-center gap-1.5 truncate">
          <Clock className={compact ? 'w-3 h-3 shrink-0' : 'w-4 h-4 shrink-0'} />
          <span className="font-semibold whitespace-nowrap">{time}</span>
          <span className="truncate">{event.title.replace('Estimate visit — ', '')}</span>
        </div>
        {!compact && (event.address || event.phone) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-yellow-800">
            {event.address && (
              <span className="inline-flex items-center gap-1 truncate max-w-[60%]">
                <MapPin className="w-3 h-3" />
                {event.address}
              </span>
            )}
            {event.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {event.phone}
              </span>
            )}
          </div>
        )}
      </button>
    )
  }

  if (event.kind === 'custom') {
    const time = event.all_day
      ? null
      : new Date(event.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    const mapsUrl = event.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address)}`
      : null
    return (
      <button
        onClick={() => onOpen(event)}
        className={`w-full text-left rounded-md border-2 border-primary-400 bg-white hover:bg-primary-50 transition-colors text-primary-900 ${
          compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-3 py-2 text-sm'
        }`}
        title={event.notes || event.title}
      >
        <div className="flex items-center gap-1.5 truncate">
          <Sparkles className={compact ? 'w-3 h-3 shrink-0' : 'w-4 h-4 shrink-0'} />
          {time && <span className="font-semibold whitespace-nowrap">{time}</span>}
          <span className="truncate">{event.title}</span>
        </div>
        {!compact && (event.address || event.phone || event.notes) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-primary-800">
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 truncate max-w-[60%] hover:underline"
              >
                <MapPin className="w-3 h-3" />
                {event.address}
              </a>
            )}
            {event.phone && (
              <a
                href={`tel:${event.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 hover:underline"
              >
                <Phone className="w-3 h-3" />
                {event.phone}
              </a>
            )}
            {event.notes && !event.address && !event.phone && (
              <span className="truncate">{event.notes}</span>
            )}
          </div>
        )}
      </button>
    )
  }

  // Install
  const colorClass = installStatusBg[event.status] ?? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
  return (
    <div className="relative">
      <button
        onClick={() => onOpen(event)}
        className={`w-full text-left rounded-sm transition-colors ${colorClass} ${
          compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-3 py-2 text-sm'
        } ${showResizeHandle ? 'pr-5' : ''}`}
        title={`#${event.job_number} — ${event.title}`}
      >
        <div className="flex items-center gap-1.5 truncate">
          <Hammer className={compact ? 'w-3 h-3 shrink-0' : 'w-4 h-4 shrink-0'} />
          <span className="font-semibold">#{event.job_number}</span>
          <span className="truncate">{event.title}</span>
        </div>
        {!compact && event.address && (
          <div className="mt-1 text-[11px] opacity-80 inline-flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3" />
            {event.address}
          </div>
        )}
      </button>
      {showResizeHandle && onResizeStart && (
        // Right-edge grab handle — pointer-driven; parent calendar tracks
        // movement and PATCHes the job on release. The cursor + tooltip
        // are the only affordances; click is suppressed so the bar's main
        // onClick (open job) doesn't fire when the user releases here.
        <span
          onPointerDown={(e) => onResizeStart(e as React.PointerEvent<HTMLElement>)}
          onClick={(e) => e.stopPropagation()}
          role="separator"
          aria-label="Drag to change end date"
          title="Drag to change end date"
          className="absolute top-0 right-0 h-full w-4 flex items-center justify-center cursor-ew-resize touch-none select-none opacity-60 hover:opacity-100"
        >
          <GripVertical className="w-3 h-3" />
        </span>
      )}
    </div>
  )
}
