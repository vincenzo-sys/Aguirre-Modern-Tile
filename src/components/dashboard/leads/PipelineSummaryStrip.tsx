'use client'

// One-glance pipeline distribution: a sticky 6-segment bar showing
// count + $ total for each stage. Borrowed from Pipedrive/HubSpot's
// deal-pipeline header. Sized proportionally by count so the heaviest
// stage visually dominates. Clicking a segment fires onPickStage —
// parent decides whether to scroll/jump or also filter.

import type { PipelineItem, PipelineStage } from '@/app/api/pipeline/route'
import { Inbox, FileText, Calendar, FilePlus, FileCheck, type LucideIcon } from 'lucide-react'
import { formatMoneyShort } from './formatters'

const STAGE_ORDER: PipelineStage[] = [
  'new', 'reviewed', 'visit_scheduled',
  'lead_in_progress', 'estimate_sent', 'estimate_revised',
]

const STAGE_DISPLAY: Record<PipelineStage, { short: string; icon: LucideIcon; chip: string }> = {
  new:              { short: 'New',     icon: Inbox,     chip: 'bg-blue-100 text-blue-800' },
  reviewed:         { short: 'Reviewed', icon: FileText,  chip: 'bg-yellow-100 text-yellow-800' },
  visit_scheduled:  { short: 'Visit',   icon: Calendar,  chip: 'bg-amber-100 text-amber-800' },
  lead_in_progress: { short: 'Active',  icon: FileText,  chip: 'bg-indigo-100 text-indigo-800' },
  estimate_sent:    { short: 'Sent',    icon: FilePlus,  chip: 'bg-purple-100 text-purple-800' },
  estimate_revised: { short: 'Revised', icon: FileCheck, chip: 'bg-pink-100 text-pink-800' },
}

export default function PipelineSummaryStrip({
  items, onPickStage,
}: {
  items: PipelineItem[]
  onPickStage?: (stage: PipelineStage) => void
}) {
  // Group once, then derive count + $ for each stage.
  const byStage = new Map<PipelineStage, PipelineItem[]>()
  for (const s of STAGE_ORDER) byStage.set(s, [])
  for (const it of items) byStage.get(it.stage)?.push(it)

  // Proportional sizing: every segment gets a base width (so empty
  // stages remain clickable) plus a share of the remainder by count.
  const maxCount = Math.max(1, ...STAGE_ORDER.map((s) => byStage.get(s)!.length))

  return (
    <div
      className="sticky top-0 z-10 bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-4"
      role="navigation"
      aria-label="Pipeline summary"
    >
      <div className="flex">
        {STAGE_ORDER.map((stage, i) => {
          const cards = byStage.get(stage) ?? []
          const count = cards.length
          const dollars = cards.reduce((sum, c) => sum + (c.estimated_cost ?? 0), 0)
          const meta = STAGE_DISPLAY[stage]
          const Icon = meta.icon
          // Each segment claims flex-grow proportional to count. Empty
          // segments still get flex-grow: 0.4 so the bar doesn't go
          // crooked when one stage has 0 and another has 30.
          const grow = count === 0 ? 0.4 : (count / maxCount) + 0.4
          const isEmpty = count === 0
          return (
            <button
              key={stage}
              type="button"
              onClick={() => onPickStage?.(stage)}
              style={{ flexGrow: grow, flexBasis: 0 }}
              className={`group min-w-[88px] text-left px-3 py-2.5 transition border-r border-gray-100 last:border-r-0 ${
                isEmpty ? 'opacity-50 hover:opacity-80' : 'hover:bg-gray-50'
              } ${i === 0 ? '' : ''}`}
              aria-label={`${meta.short}: ${count} ${count === 1 ? 'lead' : 'leads'}, ${formatMoneyShort(dollars)}`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded ${meta.chip}`}>
                  <Icon className="w-3 h-3" />
                </span>
                <span className="text-[11px] font-semibold text-gray-700 truncate">{meta.short}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-bold text-gray-900 leading-none">{count}</span>
                {dollars > 0 && (
                  <span className="text-[11px] text-gray-500 leading-none">{formatMoneyShort(dollars)}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
