'use client'

// Per-lead card surface for the redesigned /dashboard/leads page.
// All persistence stays in the parent — this component is dumb: it
// renders an item, exposes the right primary CTA for its stage, and
// fires callbacks for every action. State lives upstream.

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  Calendar, Clock, Send, FileText, Phone, MessageSquare, MoreHorizontal,
  CalendarPlus, FilePen, ExternalLink, Archive, Sparkles, Loader2, CheckCircle2,
  ArrowRight, ChevronDown,
  type LucideIcon,
} from 'lucide-react'
import type { PipelineItem } from '@/app/api/pipeline/route'
import type { PipelineStage } from '@/app/api/pipeline/route'
import {
  EditableNotesCell,
  type StageOption,
} from '@/components/dashboard/InlineEditCells'
import { STAGE_ORDER, STAGE_META, isJobStage } from '@/lib/leadStages'
import StagePickerSheet from '@/components/dashboard/leads/StagePickerSheet'
import { daysSince } from '@/components/dashboard/leads/formatters'

export type LeadCardHandlers = {
  saveStage: (item: PipelineItem, newStage: PipelineStage) => Promise<void>
  saveNotes: (item: PipelineItem, value: string | null) => Promise<void>
  markContactedNow: (item: PipelineItem) => Promise<void>
  archiveLead: (item: PipelineItem) => Promise<void>
  convertLead: (item: PipelineItem) => Promise<void>
  sendToJobs: (item: PipelineItem) => Promise<void>
  openScheduleVisit: (item: PipelineItem) => void
  openShareEstimate: (item: PipelineItem) => void | Promise<void>
  openPickFollowup: (item: PipelineItem) => void
  stageOptionsFor: (item: PipelineItem) => StageOption<PipelineStage>[]
}

type UrgencyBadge = { label: string; className: string } | null

function urgencyBadgeFor(item: PipelineItem): UrgencyBadge {
  if (item.urgency >= 100) return { label: 'Follow-up overdue', className: 'bg-red-50 text-red-700 border border-red-200' }
  if (item.urgency >= 95) return { label: 'Visit was yesterday', className: 'bg-red-50 text-red-700 border border-red-200' }
  if (item.urgency >= 90) return { label: 'Visit today', className: 'bg-orange-50 text-orange-700 border border-orange-200' }
  if (item.urgency >= 70) return { label: 'Stale (2+ weeks)', className: 'bg-amber-50 text-amber-700 border border-amber-200' }
  if (item.urgency >= 60) return { label: 'Just arrived', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' }
  if (item.urgency >= 50) return { label: 'Stale (1+ week)', className: 'bg-yellow-50 text-yellow-700 border border-yellow-200' }
  return null
}

type PrimaryAction = {
  label: string
  icon: LucideIcon
  onClick: () => void | Promise<void>
}

function primaryActionFor(item: PipelineItem, h: LeadCardHandlers): PrimaryAction {
  switch (item.stage) {
    case 'new':
      return { label: 'Schedule visit', icon: Calendar, onClick: () => h.openScheduleVisit(item) }
    case 'in_person_estimate_scheduled':
      return { label: 'Mark contacted', icon: Clock, onClick: () => h.markContactedNow(item) }
    case 'quoted':
      return { label: 'Re-send estimate', icon: Send, onClick: () => h.openShareEstimate(item) }
    case 'edits_needed':
      return { label: 'Re-send estimate', icon: Send, onClick: () => h.openShareEstimate(item) }
    case 'awaiting_response':
      return { label: 'Follow up now', icon: Clock, onClick: () => h.markContactedNow(item) }
    case 'accepted_not_scheduled':
      return { label: 'Schedule install', icon: Calendar, onClick: () => h.openScheduleVisit(item) }
    case 'scheduled':
      return { label: 'Mark contacted', icon: Clock, onClick: () => h.markContactedNow(item) }
  }
}

export default function LeadCard({
  item, handlers, compact = false,
}: {
  item: PipelineItem
  handlers: LeadCardHandlers
  compact?: boolean
}) {
  const urgency = urgencyBadgeFor(item)
  const primary = primaryActionFor(item, handlers)
  const PrimaryIcon = primary.icon
  const [busyPrimary, setBusyPrimary] = useState(false)
  const [busyAdvance, setBusyAdvance] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [stageSheetOpen, setStageSheetOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const detailHref = `/dashboard/leads/${item.id}`

  // Linear "next stage" target for the one-tap advance button. We only
  // surface this when:
  //  - There IS a next stage (i.e. not on the terminal 'scheduled' stage)
  //  - The next stage is reachable via saveStage on the current row's
  //    table (no cross-table QR → job conversion magic). The convert
  //    flow has its own affordance in the overflow menu.
  // For QR rows, "next" stays within QR stages (new → in_person_…).
  // For job rows, "next" walks through job stages.
  const currentStageMeta = STAGE_META[item.stage]
  const currentIdx = STAGE_ORDER.indexOf(item.stage)
  const nextStage: PipelineStage | null =
    currentIdx >= 0 && currentIdx < STAGE_ORDER.length - 1
      ? STAGE_ORDER[currentIdx + 1]
      : null
  // Suppress the advance button when crossing the QR/job boundary —
  // that transition needs the convert endpoint, not saveStage.
  const advanceTo: PipelineStage | null =
    nextStage && isJobStage(item.stage) === isJobStage(nextStage) ? nextStage : null
  const advanceMeta = advanceTo ? STAGE_META[advanceTo] : null

  async function runAdvance() {
    if (!advanceTo) return
    setBusyAdvance(true)
    try { await handlers.saveStage(item, advanceTo) }
    finally { setBusyAdvance(false) }
  }

  // Close overflow menu on outside-click / Esc
  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  async function runPrimary() {
    setBusyPrimary(true)
    try { await primary.onClick() } finally { setBusyPrimary(false) }
  }

  const smsHref = item.client_phone
    ? `sms:${item.client_phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(defaultSmsBody(item))}`
    : null
  const telHref = item.client_phone ? `tel:${item.client_phone.replace(/[^\d+]/g, '')}` : null

  // C2: native HTML5 drag is only enabled in compact (kanban) mode.
  // The card uses a custom MIME so the drop target can distinguish
  // lead-card drags from any other dragged content.
  const [dragging, setDragging] = useState(false)
  const dragProps = compact
    ? {
        draggable: true,
        onDragStart: (e: React.DragEvent<HTMLDivElement>) => {
          e.dataTransfer.setData(
            'application/x-lead-card',
            JSON.stringify({ id: item.id, kind: item.kind }),
          )
          e.dataTransfer.effectAllowed = 'move'
          setDragging(true)
        },
        onDragEnd: () => setDragging(false),
      }
    : {}

  return (
    <div
      {...dragProps}
      className={`bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow ${
        dragging ? 'opacity-60' : ''
      } ${compact ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {/* Top row: BIG stage chip (was a 22px-tall pill — way too small to
          tap; Vince said so directly). Now a proper button with text-sm,
          py-1.5, full-width tap target on mobile. Tap opens StagePickerSheet
          which is a real bottom sheet with 56px-tall rows, not a tiny
          dropdown. The chip still inherits STAGE_META colors so it visually
          matches the kanban column it belongs to. */}
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="flex items-start gap-2 flex-wrap min-w-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setStageSheetOpen(true) }}
            title="Tap to change stage"
            aria-haspopup="dialog"
            className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full transition active:scale-95 hover:ring-2 hover:ring-offset-1 hover:ring-primary-300 ${currentStageMeta.chip}`}
          >
            {currentStageMeta.icon && <currentStageMeta.icon className="w-3.5 h-3.5" />}
            <span>{currentStageMeta.label}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </button>
          {urgency && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded ${urgency.className}`}>
              {urgency.label}
            </span>
          )}
          <DaysInStageChip iso={item.updated_at} />
        </div>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More actions"
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 z-20 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <MenuItem
                icon={CalendarPlus}
                label="Set follow-up"
                onClick={() => { setMenuOpen(false); handlers.openPickFollowup(item) }}
              />
              <MenuItem
                icon={FilePen}
                label={showNotes ? 'Hide notes' : 'Edit notes'}
                onClick={() => { setMenuOpen(false); setShowNotes((v) => !v) }}
              />
              <Link
                href={detailHref}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-gray-700"
                onClick={() => setMenuOpen(false)}
              >
                <ExternalLink className="w-4 h-4 text-gray-400" />
                Open detail page
              </Link>
              {item.kind === 'job' && (item.stage === 'quoted' || item.stage === 'edits_needed' || item.stage === 'awaiting_response') && (
                <>
                  <div className="my-1 border-t border-gray-100" />
                  <MenuItem
                    icon={CheckCircle2}
                    label="Customer accepted → Jobs"
                    onClick={() => { setMenuOpen(false); handlers.sendToJobs(item) }}
                  />
                </>
              )}
              {item.kind === 'quote_request' && (
                <>
                  <MenuItem
                    icon={Sparkles}
                    label="Convert to job"
                    onClick={() => { setMenuOpen(false); handlers.convertLead(item) }}
                  />
                  <div className="my-1 border-t border-gray-100" />
                  <MenuItem
                    icon={Archive}
                    label="Archive (lost)"
                    danger
                    onClick={() => { setMenuOpen(false); handlers.archiveLead(item) }}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Identity */}
      <div className="px-4 mt-2">
        <Link
          href={detailHref}
          className="block font-semibold text-gray-900 hover:text-primary-700 leading-snug"
        >
          {item.project_name}
        </Link>
        <div className="mt-0.5 text-sm text-gray-600 flex items-center gap-2 flex-wrap">
          <span>{item.client_name}</span>
          {item.client_phone && (
            <>
              <span className="text-gray-300">·</span>
              <a href={telHref ?? '#'} className="hover:text-primary-700">{item.client_phone}</a>
            </>
          )}
        </div>
        {item.estimated_cost != null && item.estimated_cost > 0 && (
          <div className="mt-0.5 text-xs text-gray-500">
            Est: ${item.estimated_cost.toLocaleString()}
          </div>
        )}
      </div>

      {/* Meta line: contact + follow-up + visit (hidden in compact / kanban mode) */}
      {!compact && (
      <div className="px-4 mt-2 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
        {item.last_contact_at && (
          <span>Last contact <strong className="text-gray-700">{formatShort(item.last_contact_at)}</strong></span>
        )}
        {item.next_follow_up && (
          <span className={item.urgency >= 100 ? 'text-red-600' : ''}>
            Follow up <strong className={item.urgency >= 100 ? 'text-red-700' : 'text-gray-700'}>{formatShort(item.next_follow_up)}</strong>
            {item.urgency >= 100 && ' (overdue)'}
          </span>
        )}
        {item.site_visit_at && (
          <span className="text-amber-700">
            Visit <strong>{formatVisit(item.site_visit_at)}</strong>
          </span>
        )}
      </div>
      )}

      {/* Notes — inline editable. Hidden in compact mode (kanban). */}
      {!compact && (item.notes || showNotes) && (
        <div className="px-4 mt-3">
          <EditableNotesCell
            value={item.notes}
            onSave={(v) => handlers.saveNotes(item, v)}
          />
        </div>
      )}

      {/* Action row.
          Layout: [primary CTA (flex-1)] [Next stage →] [tel] [sms]
          The "Next →" button is the one-tap linear advance for the most
          common case ("I just sent the estimate, move to Quoted"). When
          there's no next stage in this row's table (e.g. scheduled, or a
          new QR that needs the convert endpoint to advance), this slot is
          empty and the primary CTA gets the full row. */}
      <div className="px-4 py-3 mt-3 border-t border-gray-100 flex items-stretch gap-2">
        <button
          type="button"
          onClick={runPrimary}
          disabled={busyPrimary}
          className="flex-1 inline-flex items-center justify-center gap-2 bg-primary-600 text-white rounded-lg py-3 font-semibold text-sm active:scale-95 transition disabled:opacity-60 min-h-[44px]"
        >
          {busyPrimary ? <Loader2 className="w-4 h-4 animate-spin" /> : <PrimaryIcon className="w-4 h-4" />}
          {primary.label}
        </button>
        {advanceTo && advanceMeta && (
          <button
            type="button"
            onClick={runAdvance}
            disabled={busyAdvance}
            title={`Move to ${advanceMeta.label}`}
            aria-label={`Advance stage to ${advanceMeta.label}`}
            className="inline-flex items-center justify-center gap-1 px-3 border-2 border-primary-200 bg-primary-50 text-primary-700 rounded-lg text-xs font-semibold active:scale-95 transition disabled:opacity-60 min-h-[44px] whitespace-nowrap"
          >
            {busyAdvance ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span className="hidden sm:inline">{advanceMeta.shortLabel}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        )}
        {telHref && (
          <a
            href={telHref}
            aria-label={`Call ${item.client_name}`}
            className="inline-flex items-center justify-center w-12 border-2 border-gray-200 rounded-lg text-gray-700 active:scale-95 transition"
          >
            <Phone className="w-5 h-5" />
          </a>
        )}
        {smsHref && (
          <a
            href={smsHref}
            aria-label={`Text ${item.client_name}`}
            className="inline-flex items-center justify-center w-12 border-2 border-gray-200 rounded-lg text-gray-700 active:scale-95 transition"
          >
            <MessageSquare className="w-5 h-5" />
          </a>
        )}
      </div>

      {/* Mobile-first stage picker — replaces the old 11px-text dropdown */}
      <StagePickerSheet
        open={stageSheetOpen}
        onClose={() => setStageSheetOpen(false)}
        currentStage={item.stage}
        options={handlers.stageOptionsFor(item)}
        onPick={(s) => handlers.saveStage(item, s)}
        title={`Change stage — ${item.client_name}`}
      />
    </div>
  )
}

function MenuItem({
  icon: Icon, label, onClick, danger,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-gray-50 ${
        danger ? 'text-red-600' : 'text-gray-700'
      }`}
    >
      <Icon className={`w-4 h-4 ${danger ? 'text-red-400' : 'text-gray-400'}`} />
      {label}
    </button>
  )
}

function formatShort(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatVisit(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

// "Days in this stage" — mirrors Pipedrive's deal-rotting indicator.
// updated_at is a strong proxy for stage-transition time: every PATCH
// that flips status bumps updated_at, and bumps from unrelated edits
// (notes, dates) are rare enough that the signal stays useful.
// Thresholds match Pipedrive defaults — adjust if Aguirre's pipeline
// turns out to move faster/slower than that.
function DaysInStageChip({ iso }: { iso: string | null | undefined }) {
  const d = daysSince(iso)
  if (d == null) return null
  const cls =
    d >= 14 ? 'bg-red-50 text-red-700 border border-red-200'
    : d >= 7  ? 'bg-orange-50 text-orange-700 border border-orange-200'
    : d >= 3  ? 'bg-amber-50 text-amber-700 border border-amber-200'
    : 'bg-gray-50 text-gray-600 border border-gray-200'
  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}
      title={`Last updated ${d} ${d === 1 ? 'day' : 'days'} ago`}
    >
      {d}d here
    </span>
  )
}

function defaultSmsBody(item: PipelineItem): string {
  const name = item.client_name?.split(/\s+/)[0] ?? 'there'
  switch (item.stage) {
    case 'new':
      return `Hi ${name} — Vince from Aguirre Modern Tile. Got your inquiry. When's a good time to chat about the project?`
    case 'in_person_estimate_scheduled':
      return `Hi ${name} — quick reminder about our site visit. Let me know if anything changed on your end.`
    case 'quoted':
    case 'edits_needed':
    case 'awaiting_response':
      return `Hi ${name} — checking in on the estimate. Let me know if you have any questions.`
    case 'accepted_not_scheduled':
      return `Hi ${name} — thanks for accepting. Looking to lock in your install date — what dates work on your end?`
    case 'scheduled':
      return `Hi ${name} — checking in ahead of your install. Anything we should know before we arrive?`
  }
}
