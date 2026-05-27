'use client'

// Single-stage focused list. Rendered when the user picks a segment in
// PipelineSummaryStrip — collapses the body from "4 buckets across all
// stages" to "one stream of cards for just this stage." Same LeadCard
// component so visual consistency is automatic. No internal state —
// stage + items + clear callback come from the parent.

import { X, Inbox } from 'lucide-react'
import type { PipelineItem, PipelineStage } from '@/app/api/pipeline/route'
import { STAGE_META } from '@/lib/leadStages'
import LeadCard, { type LeadCardHandlers } from '@/components/dashboard/LeadCard'
import { formatMoneyShort } from './formatters'

export default function FocusedStageList({
  stage, items, handlers, onClearFilter,
}: {
  stage: PipelineStage
  items: PipelineItem[]
  handlers: LeadCardHandlers
  onClearFilter: () => void
}) {
  const meta = STAGE_META[stage]
  const Icon = meta.icon

  // Filter to this stage, then sort by urgency desc, then by updated_at desc
  // so the freshest activity bubbles up within an urgency tier.
  const cards = items
    .filter((i) => i.stage === stage)
    .sort((a, b) => {
      if (b.urgency !== a.urgency) return b.urgency - a.urgency
      return (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
    })

  const totalDollars = cards.reduce((sum, c) => sum + (c.estimated_cost ?? 0), 0)

  return (
    <section className="mb-6">
      <div className="flex items-center gap-3 px-3 py-2 mb-3 rounded-lg border border-gray-200 bg-white">
        <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${meta.iconBg}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 truncate">{meta.label}</h2>
          <p className="text-[11px] text-gray-500">
            {cards.length} {cards.length === 1 ? 'lead' : 'leads'}
            {totalDollars > 0 && <> · {formatMoneyShort(totalDollars)}</>}
          </p>
        </div>
        <button
          type="button"
          onClick={onClearFilter}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
          aria-label="Clear stage filter"
        >
          <X className="w-3.5 h-3.5" />
          Clear
        </button>
      </div>

      {cards.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="text-center py-10">
            <Inbox className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No leads in this stage.</p>
            <p className="text-xs text-gray-400 mt-1">Adjust the Smart View or source filter, or clear the stage filter.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((item) => (
            <LeadCard key={`${item.kind}-${item.id}`} item={item} handlers={handlers} />
          ))}
        </div>
      )}
    </section>
  )
}
