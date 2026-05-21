'use client'

// Desktop kanban view of the pipeline — one column per stage,
// LeadCards rendered in compact mode. The user keeps the cards-view
// for narrow screens; kanban is hidden below md. Drag-and-drop is
// intentionally out of scope for v2 — cards still have the inline
// EditableStageCell dropdown to move between columns.

import type { PipelineItem, PipelineStage } from '@/app/api/pipeline/route'
import { Inbox, FileText, Calendar, FilePlus, FileCheck, type LucideIcon } from 'lucide-react'
import LeadCard, { type LeadCardHandlers } from '@/components/dashboard/LeadCard'
import { formatMoneyShort } from './formatters'

const STAGE_ORDER: PipelineStage[] = [
  'new', 'reviewed', 'visit_scheduled',
  'lead_in_progress', 'estimate_sent', 'estimate_revised',
]

const COLUMN_META: Record<PipelineStage, {
  label: string
  icon: LucideIcon
  // Top border + header tint — keeps columns visually distinct.
  topBorder: string
  iconChip: string
}> = {
  new:              { label: 'New inquiry',     icon: Inbox,     topBorder: 'border-t-blue-400',    iconChip: 'bg-blue-100 text-blue-700' },
  reviewed:         { label: 'Reviewed',        icon: FileText,  topBorder: 'border-t-yellow-400',  iconChip: 'bg-yellow-100 text-yellow-800' },
  visit_scheduled:  { label: 'Visit scheduled', icon: Calendar,  topBorder: 'border-t-amber-400',   iconChip: 'bg-amber-100 text-amber-800' },
  lead_in_progress: { label: 'Active lead',     icon: FileText,  topBorder: 'border-t-indigo-400',  iconChip: 'bg-indigo-100 text-indigo-800' },
  estimate_sent:    { label: 'Estimate sent',   icon: FilePlus,  topBorder: 'border-t-purple-400',  iconChip: 'bg-purple-100 text-purple-800' },
  estimate_revised: { label: 'Estimate revised', icon: FileCheck, topBorder: 'border-t-pink-400',   iconChip: 'bg-pink-100 text-pink-800' },
}

export default function KanbanBoard({
  items, handlers, focusedStage,
}: {
  items: PipelineItem[]
  handlers: LeadCardHandlers
  focusedStage?: PipelineStage | null  // when set, scroll into view
}) {
  // Group items by stage. Order within a column matches the parent's
  // sort (already by urgency desc → updated_at desc).
  const byStage = new Map<PipelineStage, PipelineItem[]>()
  for (const s of STAGE_ORDER) byStage.set(s, [])
  for (const it of items) byStage.get(it.stage)?.push(it)

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0 pb-4">
      <div className="flex gap-3 px-4 sm:px-0 min-w-min">
        {STAGE_ORDER.map((stage) => {
          const cards = byStage.get(stage) ?? []
          const dollars = cards.reduce((sum, c) => sum + (c.estimated_cost ?? 0), 0)
          const meta = COLUMN_META[stage]
          const Icon = meta.icon
          const isFocused = focusedStage === stage
          return (
            <div
              key={stage}
              ref={(el) => {
                // When the page hands us a focused stage, scroll the
                // column into view. Cheap effect — no useEffect needed
                // because the ref runs on every render.
                if (isFocused && el) {
                  el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
                }
              }}
              className={`flex-shrink-0 w-[280px] bg-gray-50 rounded-xl border border-gray-200 border-t-4 ${meta.topBorder} ${
                isFocused ? 'ring-2 ring-primary-400' : ''
              }`}
            >
              {/* Sticky column header */}
              <div className="sticky top-0 bg-gray-50/95 backdrop-blur rounded-t-xl px-3 py-2.5 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded ${meta.iconChip}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-xs font-semibold text-gray-800 flex-1 truncate">{meta.label}</span>
                  <span className="text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                    {cards.length}
                  </span>
                </div>
                {dollars > 0 && (
                  <div className="mt-1 text-[11px] text-gray-500">{formatMoneyShort(dollars)} in stage</div>
                )}
              </div>

              {/* Card list */}
              <div className="p-2 space-y-2">
                {cards.length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic text-center py-6">
                    Empty
                  </p>
                ) : (
                  cards.map((item) => (
                    <LeadCard
                      key={`${item.kind}-${item.id}`}
                      item={item}
                      handlers={handlers}
                      compact
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
