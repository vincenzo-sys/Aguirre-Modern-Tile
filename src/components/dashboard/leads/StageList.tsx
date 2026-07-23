'use client'

// Mobile deal-stage view — the vertical counterpart to KanbanBoard.
// One section per pipeline stage (in STAGE_ORDER), each with a header
// (icon + label + count + dollars) and its LeadCards stacked below.
// Empty stages are skipped to keep the phone view scannable. Cards keep
// their inline stage dropdown, so a stage change works without drag.
//
// The terminal 'completed' section is collapsible and starts collapsed
// (shared persisted key with the desktop board) so finished deals sit at
// the bottom without crowding out active work.

import { ChevronRight } from 'lucide-react'
import type { PipelineItem, PipelineStage } from '@/app/api/pipeline/route'
import { STAGE_ORDER, STAGE_META } from '@/lib/leadStages'
import LeadCard, { type LeadCardHandlers } from '@/components/dashboard/LeadCard'
import { useLocalStorageState } from '@/lib/useLocalStorageState'
import { formatMoneyShort } from './formatters'

export default function StageList({
  items, handlers,
}: {
  items: PipelineItem[]
  handlers: LeadCardHandlers
}) {
  const byStage = new Map<PipelineStage, PipelineItem[]>()
  for (const s of STAGE_ORDER) byStage.set(s, [])
  for (const it of items) byStage.get(it.stage)?.push(it)

  // Terminal 'completed' section collapses by default; choice persists and
  // is shared with the desktop KanbanBoard rail.
  const [completedOpen, setCompletedOpen] = useLocalStorageState<boolean>(
    'leads_completed_open_v1', false, (v): v is boolean => typeof v === 'boolean',
  )

  return (
    <div>
      {STAGE_ORDER.map((stage) => {
        // Sort by urgency desc, then freshest activity — same ordering
        // FocusedStageList uses, so a card sits in the same spot everywhere.
        const cards = (byStage.get(stage) ?? []).sort((a, b) => {
          if (b.urgency !== a.urgency) return b.urgency - a.urgency
          return (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
        })
        if (cards.length === 0) return null

        const meta = STAGE_META[stage]
        const Icon = meta.icon
        const dollars = cards.reduce((sum, c) => sum + (c.estimated_cost ?? 0), 0)
        const isCompleted = stage === 'completed'
        const collapsed = isCompleted && !completedOpen

        const headerInner = (
          <>
            <div className={`flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0 ${meta.iconSolid}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <h2 className={`text-base font-bold leading-tight ${meta.headerText}`}>{meta.label}</h2>
              <p className="text-xs font-medium text-gray-600 mt-0.5">
                {cards.length} {cards.length === 1 ? 'lead' : 'leads'}
                {dollars > 0 && <> · {formatMoneyShort(dollars)}</>}
              </p>
            </div>
          </>
        )

        return (
          <section key={stage} className="mb-6">
            {isCompleted ? (
              <button
                type="button"
                onClick={() => setCompletedOpen((v) => !v)}
                aria-expanded={!collapsed}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border-l-[6px] ${meta.spine} ${meta.headerBar}`}
              >
                {headerInner}
                <ChevronRight className={`w-5 h-5 text-gray-500 flex-shrink-0 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
              </button>
            ) : (
              <div className={`flex items-center gap-3 px-3 py-2.5 mb-3 rounded-lg border-l-[6px] ${meta.spine} ${meta.headerBar}`}>
                {headerInner}
              </div>
            )}

            {!collapsed && (
              <div className={`space-y-3 ${isCompleted ? 'mt-3' : ''}`}>
                {cards.map((item) => (
                  <LeadCard key={`${item.kind}-${item.id}`} item={item} handlers={handlers} />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
