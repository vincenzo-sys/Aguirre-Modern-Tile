'use client'

// Per-lead card surface for the redesigned /dashboard/leads page.
// All persistence stays in the parent — this component is dumb: it
// renders an item, exposes the right primary CTA for its stage, and
// fires callbacks for every action. State lives upstream.

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  MoreHorizontal, CalendarPlus, FilePen, ExternalLink, Archive, Sparkles,
  CheckCircle2, ChevronDown, Phone, MessageSquare, Check,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PipelineItem } from '@/app/api/pipeline/route'
import type { PipelineStage } from '@/app/api/pipeline/route'
import {
  EditableNotesCell,
  type StageOption,
} from '@/components/dashboard/InlineEditCells'
import { STAGE_META } from '@/lib/leadStages'
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

export default function LeadCard({
  item, handlers, compact = false,
}: {
  item: PipelineItem
  handlers: LeadCardHandlers
  compact?: boolean
}) {
  const urgency = urgencyBadgeFor(item)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [stageSheetOpen, setStageSheetOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const detailHref = `/dashboard/leads/${item.id}`

  const currentStageMeta = STAGE_META[item.stage]

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

  const phoneDigits = item.client_phone ? item.client_phone.replace(/[^\d+]/g, '') : null
  const telHref = phoneDigits ? `tel:${phoneDigits}` : null
  const smsHref = phoneDigits ? `sms:${phoneDigits}` : null
  const contactedToday =
    item.last_contact_at != null && item.last_contact_at.slice(0, 10) === new Date().toISOString().slice(0, 10)

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
      className={`relative bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow pb-3 ${
        dragging ? 'opacity-60' : ''
      } ${compact ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
    >
      {/* Top row: BIG stage chip (was a 22px-tall pill — way too small to
          tap; Vince said so directly). Now a proper button with text-sm,
          py-1.5, full-width tap target on mobile. Tap opens StagePickerSheet
          which is a real bottom sheet with 56px-tall rows, not a tiny
          dropdown. The chip still inherits STAGE_META colors so it visually
          matches the kanban column it belongs to. */}
      <div className="relative z-20 flex items-start justify-between gap-3 px-4 pt-3">
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

      {/* Identity — non-interactive text. Clicks here fall through to the
          card-wide link overlay above. The phone number is the only inline
          interactive element and uses z-20 to capture its own click. */}
      <div className="px-4 mt-2">
        <div className="font-semibold text-gray-900 leading-snug">
          {item.project_name}
        </div>
        <div className="mt-0.5 text-sm text-gray-600 flex items-center gap-2 flex-wrap">
          <span>{item.client_name}</span>
          {item.client_phone && telHref && (
            <>
              <span className="text-gray-300">·</span>
              <a
                href={telHref}
                onClick={(e) => e.stopPropagation()}
                className="relative z-20 hover:text-primary-700"
              >
                {item.client_phone}
              </a>
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

      {/* Quick-action row: Call · Text · Mark contacted. Hidden in
          compact (kanban) mode where space is tight. Each button uses
          z-20 + stopPropagation so it captures its own click and the
          card-wide link overlay doesn't fire. */}
      {!compact && (
        <div
          className="relative z-20 px-4 mt-3 grid grid-cols-3 gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {telHref ? (
            <a
              href={telHref}
              className="inline-flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 min-h-[40px]"
              aria-label={`Call ${item.client_name}`}
            >
              <Phone className="w-3.5 h-3.5" />
              Call
            </a>
          ) : (
            <span className="inline-flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium text-gray-300 bg-gray-50 border border-gray-100 rounded-md min-h-[40px]" aria-disabled="true">
              <Phone className="w-3.5 h-3.5" />
              Call
            </span>
          )}
          {smsHref ? (
            <a
              href={smsHref}
              className="inline-flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 min-h-[40px]"
              aria-label={`Text ${item.client_name}`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Text
            </a>
          ) : (
            <span className="inline-flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium text-gray-300 bg-gray-50 border border-gray-100 rounded-md min-h-[40px]" aria-disabled="true">
              <MessageSquare className="w-3.5 h-3.5" />
              Text
            </span>
          )}
          <button
            type="button"
            onClick={() => handlers.markContactedNow(item)}
            className={`inline-flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium rounded-md min-h-[40px] border transition ${
              contactedToday
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                : 'text-gray-700 bg-white border-gray-200 hover:bg-gray-50'
            }`}
            title={contactedToday ? 'Contacted today — tap to bump timestamp' : 'Mark contacted now'}
          >
            <Check className="w-3.5 h-3.5" />
            Contacted
          </button>
        </div>
      )}

      {/* Notes — inline editable. Hidden in compact mode (kanban).
          z-20 + stopPropagation so editing notes doesn't navigate away. */}
      {!compact && (item.notes || showNotes) && (
        <div
          className="relative z-20 px-4 mt-3"
          onClick={(e) => e.stopPropagation()}
        >
          <EditableNotesCell
            value={item.notes}
            onSave={(v) => handlers.saveNotes(item, v)}
          />
        </div>
      )}

      {/* Whole-card click → detail page (Vince: "I'm fine clicking into them").
          Stretched-link pattern: the <a> is absolutely positioned over the
          entire card at z-10. Interactive children (stage chip, overflow
          menu, customer phone link, notes editor) sit at z-20 so they
          capture their own clicks. Non-interactive areas (identity text,
          meta line, blank padding) fall through to the link. */}
      <Link
        href={detailHref}
        aria-label={`Open ${item.client_name}`}
        className="absolute inset-0 z-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-400"
      />

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

