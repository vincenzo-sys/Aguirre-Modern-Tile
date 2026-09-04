'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Clock, GripVertical, Hammer, MapPin, Phone, Plus, Sparkles } from 'lucide-react'
import { toast } from '@/components/Toast'
import AddEventModal from './AddEventModal'
import ScheduleInstallModal from './ScheduleInstallModal'
import type { CalendarEvent } from '@/lib/supabase/types'
import type { JobPickerOption } from '@/lib/jobPicker'
import { jobStatusMeta } from '@/lib/jobStatus'
import { buildDayLayout, maxLaneOn, type Segment, type SpanInput } from '@/lib/calendarLayout'
import { daysBetween, endFromSpan, parseYmd, shiftDate, spanDays, ymdOf } from '@/lib/scheduleDates'

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

/** Lanes rendered per month cell before the rest collapse into "+N more". */
const MAX_LANES = 4

/** Hold this long before a drag arms, so a flick still scrolls the page. */
const LONG_PRESS_MS = 450
/** Move further than this before arming and it was a scroll, not a drag. */
const DRAG_SLOP_PX = 10

function ymd(date: Date): string {
  return ymdOf(date)
}

function dateKeyOf(iso: string): string {
  // For both visits (timestamp) and installs (date), bucket by local date
  return ymd(new Date(iso))
}

function formatVisitTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatLongDate(value: string): string {
  // Callers pass a YYYY-MM-DD day key. `new Date('2026-09-08')` parses as UTC
  // midnight, which renders as the PREVIOUS day anywhere west of Greenwich —
  // every agenda header used to read a day early in Boston. parseYmd anchors
  // to local midnight instead.
  const d = parseYmd(value) ?? new Date(value)
  return d.toLocaleDateString('en-US', {
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

/** Unique across kinds — an install and a custom event can share a raw id. */
function spanKeyOf(ev: ScheduleEvent): string {
  return `${ev.kind}:${ev.id}`
}

/**
 * The in-flight drag, as one object. Resize only moves `endYmd`; move shifts
 * both. Keeping it in a single piece of state is what lets the layout memo
 * declare complete dependencies — the previous code read `resizing` inside a
 * memo whose dep array was `[events]`, so the bar never previewed at all and
 * only snapped after the PATCH round-tripped.
 */
type Preview = { key: string; startYmd: string; endYmd: string } | null

function installDates(ev: Extract<ScheduleEvent, { kind: 'install' }>): { start: string; end: string } {
  const start = ev.start.slice(0, 10)
  const end = (ev.end || ev.start).slice(0, 10)
  return { start, end: end < start ? start : end }
}

function toSpans(events: ScheduleEvent[], preview: Preview): SpanInput[] {
  return events.map((ev) => {
    const id = spanKeyOf(ev)
    if (preview && preview.key === id) {
      return { id, kind: ev.kind, startYmd: preview.startYmd, endYmd: preview.endYmd }
    }
    if (ev.kind === 'install') {
      const { start, end } = installDates(ev)
      return { id, kind: ev.kind, startYmd: start, endYmd: end }
    }
    if (ev.kind === 'custom' && ev.end) {
      return { id, kind: ev.kind, startYmd: dateKeyOf(ev.start), endYmd: dateKeyOf(ev.end) }
    }
    const day = dateKeyOf(ev.start)
    return { id, kind: ev.kind, startYmd: day, endYmd: day }
  })
}

export default function ScheduleCalendar({
  jobs = [],
}: {
  jobs?: JobPickerOption[]
} = {}) {
  const router = useRouter()
  const [view, setView] = useState<View>('month')
  const [cursor, setCursor] = useState<Date>(new Date())
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  // Two separate defaults. They used to share one `modalDefaultDate`, so the
  // install modal's start date was whatever the last Add-Event interaction had
  // left behind — the toolbar button never set it at all.
  const [eventDefaultDate, setEventDefaultDate] = useState<string | null>(null)
  const [installDefaultStart, setInstallDefaultStart] = useState<string | null>(null)
  const [installModalOpen, setInstallModalOpen] = useState(false)
  const [installGateBlock, setInstallGateBlock] = useState<string | null>(null)
  const [editingInstall, setEditingInstall] = useState<
    { id: string; job_number: number; title: string; start: string; end: string } | null
  >(null)
  // Which day the two-button action sheet is open for.
  const [dayActionYmd, setDayActionYmd] = useState<string | null>(null)

  const [preview, setPreview] = useState<Preview>(null)
  const [dragMode, setDragMode] = useState<'resize' | 'move' | null>(null)
  // The pointerup listener captures its closure once, so it reads the live
  // preview through a ref rather than a stale state value.
  const previewRef = useRef<Preview>(null)
  useEffect(() => { previewRef.current = preview }, [preview])
  // A drag ends with a click on the bar it started from, which would also
  // open the re-schedule modal. A deadline rather than a boolean flag: a
  // release that lands outside the bar fires no click at all, and a sticky
  // boolean would then swallow the NEXT legitimate tap.
  const suppressClickUntilRef = useRef(0)
  function suppressNextClick() {
    suppressClickUntilRef.current = Date.now() + 300
  }

  // Mobile-first default: a 7-column month grid is cramped on a phone (tiny
  // truncated chips, "+N more"), so open to the agenda list ("next 30 days")
  // on small screens where the real question is "what's coming up." Runs once
  // on mount (post-hydration, to avoid an SSR mismatch on the view toggle);
  // the toggle still lets the user switch to month/week. NB: a local
  // `const window` (the fetch date-range, below) shadows the browser global,
  // so reach matchMedia via globalThis.
  useEffect(() => {
    if (globalThis.matchMedia?.('(max-width: 767px)')?.matches) setView('agenda')
  }, [])

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

  const eventByKey = useMemo(() => {
    const map = new Map<string, ScheduleEvent>()
    for (const ev of events) map.set(spanKeyOf(ev), ev)
    return map
  }, [events])

  // Lane-assigned segments, one per day a span touches. A span keeps ONE lane
  // for its whole life, which is what makes the per-cell segments line up into
  // a single continuous bar instead of N repeated chips.
  const layout = useMemo(
    () => buildDayLayout(toSpans(events, preview)),
    [events, preview],
  )

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
    // A drag that ended on this chip must not also open it.
    if (Date.now() < suppressClickUntilRef.current) return
    if (ev.kind === 'install') {
      // Re-schedule modal in place instead of a full page nav. The "Open
      // job" link inside the modal still routes to the job detail when
      // Vince needs the full record.
      const { start, end } = installDates(ev)
      setEditingInstall({ id: ev.id, job_number: ev.job_number, title: ev.title, start, end })
      setInstallGateBlock(null)
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
      setEventDefaultDate(null)
      setModalOpen(true)
    }
  }

  function openAddEvent(dayYmd: string | null = null) {
    setEditingEvent(null)
    setEventDefaultDate(dayYmd)
    setModalOpen(true)
  }

  function openScheduleInstall(dayYmd: string | null = null) {
    setEditingInstall(null)
    setInstallGateBlock(null)
    setInstallDefaultStart(dayYmd ?? ymd(new Date()))
    setInstallModalOpen(true)
  }

  // ── Drag: shared hit-testing ────────────────────────────────────────────
  // Day cells carry data-day="YYYY-MM-DD"; elementsFromPoint lets us look up
  // whichever day is under the pointer even though the bar itself is on top.
  function findDayUnder(x: number, y: number): string | null {
    const stack = document.elementsFromPoint(x, y)
    for (const el of stack) {
      const cell = (el as HTMLElement).closest('[data-day]') as HTMLElement | null
      if (cell?.dataset.day) return cell.dataset.day
    }
    return null
  }

  /**
   * Drag the right edge of an install to change its end date.
   * NOTE this PATCHes `scheduled_end` only, which depositGate's
   * isSchedulingAction does not consider a scheduling action — so unlike a
   * move, a resize is never gated.
   */
  function startResizeInstall(installId: string, e: React.PointerEvent<HTMLElement>) {
    e.preventDefault()
    e.stopPropagation()
    const found = events.find((x) => x.kind === 'install' && x.id === installId)
    if (!found || found.kind !== 'install') return
    const { start: startYmd, end: originalEnd } = installDates(found)
    const key = spanKeyOf(found)
    setDragMode('resize')
    setPreview({ key, startYmd, endYmd: originalEnd })

    function onMove(moveEvt: PointerEvent) {
      const dayYmd = findDayUnder(moveEvt.clientX, moveEvt.clientY)
      if (!dayYmd) return
      const clamped = dayYmd < startYmd ? startYmd : dayYmd
      suppressNextClick()
      setPreview((prev) => (prev && prev.endYmd !== clamped ? { ...prev, endYmd: clamped } : prev))
    }

    async function onUp() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      const final = previewRef.current?.endYmd
      setPreview(null)
      setDragMode(null)
      if (!final || final === originalEnd) return
      setEvents((prev) =>
        prev.map((p) => (p.kind === 'install' && p.id === installId ? { ...p, end: final } : p)),
      )
      try {
        const res = await fetch(`/api/jobs/${installId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduled_end: final }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Save failed')
        // The install modal surfaces this; the resize path used to swallow it.
        if (data.deposit_warning?.message) toast(data.deposit_warning.message, 'error')
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

  /**
   * Long-press an install bar and drag it to another day. Keeps its length.
   *
   * Pointer events, not HTML5 drag-and-drop: the leads-board CalendarView uses
   * `draggable` + dataTransfer, which never fires on iOS Safari touch, so that
   * view has silently been desktop-only. Christian works from a phone.
   */
  function startMoveInstall(installId: string, e: React.PointerEvent<HTMLElement>) {
    const found = events.find((x) => x.kind === 'install' && x.id === installId)
    if (!found || found.kind !== 'install') return
    const install = found
    const { start: originalStart, end: originalEnd } = installDates(install)
    const key = spanKeyOf(install)
    const span = spanDays(originalStart, originalEnd)
    const grabCell = (e.currentTarget as HTMLElement).closest('[data-day]') as HTMLElement | null
    // Grabbing day 3 of a 5-day bar keeps the bar under the finger rather than
    // snapping its start to the pointer.
    const offset = grabCell?.dataset.day ? daysBetween(originalStart, grabCell.dataset.day) : 0
    const originX = e.clientX
    const originY = e.clientY

    let armed = false
    let timer: ReturnType<typeof setTimeout> | null = null

    // Only once the drag is armed do we swallow touchmove. Putting
    // `touch-action: none` on the chip instead would kill page scrolling for
    // any finger that merely lands on one.
    function blockTouch(evt: TouchEvent) { evt.preventDefault() }

    function cleanup() {
      if (timer) clearTimeout(timer)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      document.removeEventListener('touchmove', blockTouch)
    }

    function arm() {
      armed = true
      navigator.vibrate?.(10)
      suppressNextClick()
      setDragMode('move')
      setPreview({ key, startYmd: originalStart, endYmd: originalEnd })
      document.addEventListener('touchmove', blockTouch, { passive: false })
    }

    function onMove(moveEvt: PointerEvent) {
      if (!armed) {
        // Moving before the press lands means the user is scrolling.
        const dx = Math.abs(moveEvt.clientX - originX)
        const dy = Math.abs(moveEvt.clientY - originY)
        if (dx > DRAG_SLOP_PX || dy > DRAG_SLOP_PX) cleanup()
        return
      }
      const dayYmd = findDayUnder(moveEvt.clientX, moveEvt.clientY)
      if (!dayYmd) return
      const newStart = shiftDate(dayYmd, -offset)
      const newEnd = endFromSpan(newStart, span)
      suppressNextClick()
      setPreview((prev) =>
        prev && prev.startYmd !== newStart ? { ...prev, startYmd: newStart, endYmd: newEnd } : prev,
      )
    }

    function onUp() {
      cleanup()
      if (!armed) return
      suppressNextClick()
      const final = previewRef.current
      setPreview(null)
      setDragMode(null)
      if (!final || final.startYmd === originalStart) return
      void commitMove(install, final.startYmd, final.endYmd)
    }

    timer = setTimeout(arm, LONG_PRESS_MS)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  async function commitMove(
    install: Extract<ScheduleEvent, { kind: 'install' }>,
    newStart: string,
    newEnd: string,
  ) {
    const rollback = events
    setEvents((prev) =>
      prev.map((p) =>
        p.kind === 'install' && p.id === install.id ? { ...p, start: newStart, end: newEnd } : p,
      ),
    )
    try {
      const res = await fetch(`/api/jobs/${install.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_start: newStart, scheduled_end: newEnd }),
      })
      const data = await res.json().catch(() => ({}))

      // 409 is the deposit gate. Unlike a resize, a move writes
      // scheduled_start, which IS a scheduling action. A gesture can't render
      // an override panel and must not silently swallow the refusal — so put
      // the dates back and hand the user the one gate UI that already exists,
      // pre-filled with what they attempted.
      if (res.status === 409) {
        setEvents(rollback)
        setEditingInstall({
          id: install.id,
          job_number: install.job_number,
          title: install.title,
          start: newStart,
          end: newEnd,
        })
        setInstallGateBlock(
          data.error || 'This job needs its deposit recorded before it can be scheduled.',
        )
        setInstallModalOpen(true)
        return
      }
      if (!res.ok) {
        setEvents(rollback)
        toast(data.error ?? 'Move failed', 'error')
        return
      }
      if (data.deposit_warning?.message) toast(data.deposit_warning.message, 'error')
      toast(`#${install.job_number} moved to ${newStart}`, 'success')
      refetchSchedule()
    } catch (err) {
      setEvents(rollback)
      toast(err instanceof Error ? err.message : 'Move failed', 'error')
    }
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

  const gridProps = {
    layout,
    eventByKey,
    onOpen: openEvent,
    onCreate: (dayYmd: string) => setDayActionYmd(dayYmd),
    onResizeRight: startResizeInstall,
    onMoveStart: startMoveInstall,
    draggingKey: dragMode === 'move' ? preview?.key ?? null : null,
  }

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
            onClick={() => openScheduleInstall(null)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-primary-700 bg-primary-50 border border-primary-200 rounded hover:bg-primary-100"
          >
            <Hammer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Schedule install</span>
            <span className="sm:hidden">Install</span>
          </button>
          <button
            onClick={() => openAddEvent(null)}
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
        <span className="ml-auto hidden lg:inline text-gray-400">
          Hold an install to move it · drag its right edge to change the end date
        </span>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
      ) : view === 'agenda' ? (
        <AgendaView events={events} onOpen={openEvent} />
      ) : view === 'week' ? (
        <WeekGrid cursor={cursor} {...gridProps} />
      ) : (
        <MonthGrid cursor={cursor} {...gridProps} />
      )}

      {/* Tapping an empty day asks which kind of thing goes there. Before, it
          always opened the event modal, so there was no way to put an install
          on a tapped day at all. */}
      {dayActionYmd && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => setDayActionYmd(null)}
        >
          <div
            className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-4 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-1 pb-1 text-sm font-semibold text-gray-900">
              {formatLongDate(dayActionYmd)}
            </p>
            <button
              type="button"
              onClick={() => { const d = dayActionYmd; setDayActionYmd(null); openScheduleInstall(d) }}
              className="w-full min-h-[56px] flex items-center gap-2 px-4 rounded-lg border border-primary-200 bg-primary-50 text-primary-800 font-semibold hover:bg-primary-100"
            >
              <Hammer className="w-4 h-4" />
              Schedule install
            </button>
            <button
              type="button"
              onClick={() => { const d = dayActionYmd; setDayActionYmd(null); openAddEvent(d) }}
              className="w-full min-h-[56px] flex items-center gap-2 px-4 rounded-lg border border-gray-200 bg-white text-gray-800 font-semibold hover:bg-gray-50"
            >
              <Sparkles className="w-4 h-4" />
              Add event
            </button>
            <button
              type="button"
              onClick={() => setDayActionYmd(null)}
              className="w-full min-h-[44px] text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <AddEventModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        event={editingEvent}
        defaultDate={eventDefaultDate}
        jobs={jobs}
        onSaved={refetchSchedule}
        onDeleted={refetchSchedule}
      />

      <ScheduleInstallModal
        open={installModalOpen}
        onClose={() => { setInstallModalOpen(false); setInstallGateBlock(null) }}
        jobs={jobs}
        install={editingInstall}
        defaultStart={installDefaultStart}
        initialGateBlock={installGateBlock}
        onSaved={refetchSchedule}
      />
    </div>
  )
}

type GridProps = {
  layout: Map<string, Segment[]>
  eventByKey: Map<string, ScheduleEvent>
  onOpen: (ev: ScheduleEvent) => void
  onCreate: (dayYmd: string) => void
  onResizeRight: (installId: string, e: React.PointerEvent<HTMLElement>) => void
  onMoveStart: (installId: string, e: React.PointerEvent<HTMLElement>) => void
  draggingKey: string | null
}

function MonthGrid({
  cursor,
  layout,
  eventByKey,
  onOpen,
  onCreate,
  onResizeRight,
  onMoveStart,
  draggingKey,
}: GridProps & { cursor: Date }) {
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
          const segs = layout.get(key) ?? []
          const isToday = key === today
          const visible = segs.filter((s) => s.lane < MAX_LANES)
          const hidden = segs.length - visible.length
          const lastLane = maxLaneOn(visible)
          // A bar that wraps onto a new week re-labels itself on Sunday,
          // otherwise the continuation row would be a nameless colour block.
          const isRowStart = cell.date.getDay() === 0
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
              // No horizontal padding on the cell: the lane rail runs
              // full-bleed so a continuing bar can reach the cell edges and
              // paint over the border, which is what makes it look continuous.
              className={`min-h-[110px] border-b border-r border-gray-100 py-1.5 flex flex-col gap-1 cursor-pointer hover:bg-gray-50/60 ${
                isToday ? 'bg-primary-50/40' : ''
              }`}
            >
              <span className={`px-1.5 text-xs font-semibold ${isToday ? 'text-primary-700' : 'text-gray-500'}`}>
                {cell.date.getDate()}
              </span>
              <div className="flex flex-col gap-0.5">
                {Array.from({ length: lastLane + 1 }).map((_, lane) => {
                  const seg = visible.find((s) => s.lane === lane)
                  // Empty lanes still take space, so lane N sits at the same
                  // y-offset in every cell — the thing that lets the segments
                  // line up into one bar.
                  if (!seg) return <div key={lane} className="h-5" aria-hidden />
                  const ev = eventByKey.get(seg.id)
                  if (!ev) return <div key={lane} className="h-5" aria-hidden />
                  const canResize = ev.kind === 'install' && seg.isEnd
                  return (
                    <EventChip
                      key={seg.id}
                      event={ev}
                      segment={seg}
                      bar
                      showLabel={seg.isStart || isRowStart}
                      dimmed={draggingKey === seg.id}
                      onOpen={onOpen}
                      showResizeHandle={canResize}
                      onResizeStart={canResize ? (e) => onResizeRight(ev.id, e) : undefined}
                      onMoveStart={ev.kind === 'install' ? (e) => onMoveStart(ev.id, e) : undefined}
                    />
                  )
                })}
                {hidden > 0 && (
                  <span className="px-1.5 text-[10px] text-gray-500">+{hidden} more</span>
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
  layout,
  eventByKey,
  onOpen,
  onCreate,
  onResizeRight,
  onMoveStart,
  draggingKey,
}: GridProps & { cursor: Date }) {
  const start = startOfWeek(cursor)
  const today = ymd(new Date())

  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: 7 }).map((_, i) => {
        const date = addDays(start, i)
        const key = ymd(date)
        const segs = layout.get(key) ?? []
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
              {segs.length === 0 ? (
                <span className="text-xs text-gray-300 italic mt-2">Nothing scheduled</span>
              ) : (
                segs.map((seg) => {
                  const ev = eventByKey.get(seg.id)
                  if (!ev) return null
                  const canResize = ev.kind === 'install' && seg.isEnd
                  return (
                    <EventChip
                      key={seg.id}
                      event={ev}
                      segment={seg}
                      dimmed={draggingKey === seg.id}
                      onOpen={onOpen}
                      showResizeHandle={canResize}
                      onResizeStart={canResize ? (e) => onResizeRight(ev.id, e) : undefined}
                      onMoveStart={ev.kind === 'install' ? (e) => onMoveStart(ev.id, e) : undefined}
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
    const key = ev.kind === 'install' ? ev.start.slice(0, 10) : dateKeyOf(ev.start)
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
              <EventChip key={spanKeyOf(ev)} event={ev} onOpen={onOpen} agendaSpan />
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
  bar = false,
  segment = null,
  showLabel = true,
  dimmed = false,
  agendaSpan = false,
  showResizeHandle = false,
  onResizeStart,
  onMoveStart,
}: {
  event: ScheduleEvent
  onOpen: (ev: ScheduleEvent) => void
  compact?: boolean
  /** Month-grid mode: a fixed-height lane bar rather than a free-standing chip. */
  bar?: boolean
  segment?: Segment | null
  /** False on continuation cells, so a 5-day bar doesn't write its name 5 times. */
  showLabel?: boolean
  dimmed?: boolean
  /** Agenda lists a span once, under its start date — annotate its length. */
  agendaSpan?: boolean
  // Set on the LAST day's segment of a multi-day install so the user can grab
  // the right edge and drag-resize across day cells. Calendar parent handles
  // the actual pointer tracking + PATCH.
  showResizeHandle?: boolean
  onResizeStart?: (e: React.PointerEvent<HTMLElement>) => void
  onMoveStart?: (e: React.PointerEvent<HTMLElement>) => void
}) {
  // ── Month-grid lane bar ──────────────────────────────────────────────────
  if (bar && segment) {
    const tone =
      event.kind === 'install'
        ? jobStatusMeta(event.status).chip
        : event.kind === 'custom'
          ? 'bg-white border border-primary-400 text-primary-900 hover:bg-primary-50'
          : 'bg-yellow-50 border border-yellow-400 text-yellow-900 hover:bg-yellow-100'
    const label =
      event.kind === 'install'
        ? `#${event.job_number} ${event.title}`
        : event.kind === 'estimate_visit'
          ? event.title.replace('Estimate visit — ', '')
          : event.title
    const hover =
      event.kind === 'install'
        ? `#${event.job_number} — ${event.title}${segment.spanDays > 1 ? ` · ${segment.spanDays} days` : ''}`
        : label
    return (
      <div
        className={`relative h-5 ${segment.isStart ? 'ml-0.5' : ''} ${
          // -mr-px paints over the cell's own right border so the bar reads as
          // continuous across the week row; z-10 keeps it above the next
          // cell's background tint.
          segment.isEnd ? 'mr-0.5' : '-mr-px z-10'
        } ${dimmed ? 'opacity-50' : ''}`}
      >
        <button
          onClick={() => onOpen(event)}
          onPointerDown={onMoveStart}
          className={`w-full h-5 leading-5 text-[11px] font-medium truncate text-left transition-colors ${tone} ${
            segment.isStart ? 'pl-1.5 rounded-l-sm' : 'pl-0'
          } ${
            segment.isEnd
              ? `${showResizeHandle ? 'pr-4' : 'pr-1.5'} rounded-r-sm`
              : 'pr-0'
          }`}
          title={hover}
        >
          {showLabel ? label : ' '}
        </button>
        {showResizeHandle && onResizeStart && (
          <span
            onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e as React.PointerEvent<HTMLElement>) }}
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
    const continued = Boolean(segment && !segment.isStart)
    const agendaDays = agendaSpan && event.end
      ? spanDays(dateKeyOf(event.start), dateKeyOf(event.end))
      : 1
    return (
      <button
        onClick={() => onOpen(event)}
        className={`w-full text-left rounded-md border-2 border-primary-400 bg-white hover:bg-primary-50 transition-colors text-primary-900 ${
          compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-3 py-2 text-sm'
        } ${dimmed ? 'opacity-50' : ''}`}
        title={event.notes || event.title}
      >
        <div className="flex items-center gap-1.5 truncate">
          <Sparkles className={compact ? 'w-3 h-3 shrink-0' : 'w-4 h-4 shrink-0'} />
          {time && !continued && <span className="font-semibold whitespace-nowrap">{time}</span>}
          <span className="truncate">{event.title}</span>
          {segment && segment.spanDays > 1 && (
            <span className="ml-auto shrink-0 text-[10px] opacity-70 whitespace-nowrap">
              Day {segment.dayIndex} of {segment.spanDays}
            </span>
          )}
          {agendaDays > 1 && (
            <span className="ml-auto shrink-0 text-[10px] opacity-70 whitespace-nowrap">
              {agendaDays} days
            </span>
          )}
        </div>
        {!compact && !continued && (event.address || event.phone || event.notes) && (
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
  const colorClass = jobStatusMeta(event.status).chip
  const continued = Boolean(segment && !segment.isStart)
  const agendaDays = agendaSpan ? spanDays(event.start.slice(0, 10), (event.end || event.start).slice(0, 10)) : 1
  return (
    <div
      className={`relative ${dimmed ? 'opacity-50' : ''} ${
        // A continuation row in the week list gets a spine instead of a full
        // repeat of the title, so a 5-day install doesn't read as 5 jobs.
        continued ? 'border-l-4 border-gray-300 pl-1' : ''
      }`}
    >
      <button
        onClick={() => onOpen(event)}
        onPointerDown={onMoveStart}
        className={`w-full text-left rounded-sm transition-colors ${colorClass} ${
          compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-3 py-2 text-sm'
        } ${showResizeHandle ? 'pr-5' : ''}`}
        title={`#${event.job_number} — ${event.title}`}
      >
        <div className="flex items-center gap-1.5 truncate">
          <Hammer className={compact ? 'w-3 h-3 shrink-0' : 'w-4 h-4 shrink-0'} />
          <span className="font-semibold">#{event.job_number}</span>
          <span className="truncate">{event.title}</span>
          {segment && segment.spanDays > 1 && (
            <span className="ml-auto shrink-0 text-[10px] opacity-70 whitespace-nowrap">
              Day {segment.dayIndex} of {segment.spanDays}
            </span>
          )}
          {agendaDays > 1 && (
            <span className="ml-auto shrink-0 text-[10px] opacity-70 whitespace-nowrap">
              {agendaDays} days
            </span>
          )}
        </div>
        {!compact && !continued && event.address && (
          <div className="mt-1 text-[11px] opacity-80 inline-flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3" />
            {event.address}
          </div>
        )}
      </button>
      {showResizeHandle && onResizeStart && (
        // Right-edge grab handle — pointer-driven; parent calendar tracks
        // movement and PATCHes the job on release. stopPropagation keeps it
        // from also arming a move-drag on the bar underneath.
        <span
          onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e as React.PointerEvent<HTMLElement>) }}
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
