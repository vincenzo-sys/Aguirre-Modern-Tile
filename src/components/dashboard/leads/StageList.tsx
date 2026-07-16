'use client'

// Mobile deal-stage view — the vertical counterpart to KanbanBoard.
// One section per pipeline stage (in STAGE_ORDER), each with a header
// (icon + label + count + dollars) and its LeadCards stacked below.
// Empty stages are skipped to keep the phone view scannable. Cards keep
// their inline stage dropdown, so a stage change works without drag.

import type { PipelineItem, PipelineStage } from '@/app/api/pipeline/route'
import { STAGE_ORDER, STAGE_META } from '@/lib/leadStages'
import LeadCard, { type LeadCardHandlers } from '@/components/dashboard/LeadCard'
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

        return (
          <section key={stage} className="mb-6">
            <div className={`flex items-center gap-3 px-3 py-2 mb-3 rounded-lg border border-gray-200 border-t-4 ${meta.topBorder} bg-white`}>
              <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${meta.iconBg}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-gray-900 truncate">{meta.label}</h2>
                <p className="text-[11px] text-gray-500">
                  {cards.length} {cards.length === 1 ? 'lead' : 'leads'}
                  {dollars > 0 && <> · {formatMoneyShort(dollars)}</>}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {cards.map((item) => (
                <LeadCard key={`${item.kind}-${item.id}`} item={item} handlers={handlers} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
