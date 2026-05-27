'use client'

// One-glance pipeline distribution: a sticky 7-segment bar showing
// count + $ total for each stage. Borrowed from Pipedrive/HubSpot's
// deal-pipeline header. Sized proportionally by count so the heaviest
// stage visually dominates. Clicking a segment fires onPickStage —
// parent decides whether to scroll/jump or also filter.
//
// At narrow widths (mobile, or cards-mode constrained to max-w-2xl on
// desktop) the seven 88px-min segments overflow the container. We allow
// horizontal scroll with scroll-snap so every stage stays reachable,
// and auto-scroll the active segment into view so the affordance is
// discoverable.

import { useEffect, useRef } from 'react'
import type { PipelineItem, PipelineStage } from '@/app/api/pipeline/route'
import { STAGE_ORDER, STAGE_META } from '@/lib/leadStages'
import { formatMoneyShort } from './formatters'

export default function PipelineSummaryStrip({
  items, onPickStage, activeStage = null,
}: {
  items: PipelineItem[]
  onPickStage?: (stage: PipelineStage) => void
  activeStage?: PipelineStage | null
}) {
  // Group once, then derive count + $ for each stage.
  const byStage = new Map<PipelineStage, PipelineItem[]>()
  for (const s of STAGE_ORDER) byStage.set(s, [])
  for (const it of items) byStage.get(it.stage)?.push(it)

  // Proportional sizing: every segment gets a base width (so empty
  // stages remain clickable) plus a share of the remainder by count.
  const maxCount = Math.max(1, ...STAGE_ORDER.map((s) => byStage.get(s)!.length))

  // Auto-scroll the active segment into view whenever activeStage
  // changes. Without this, a user who filtered to "Scheduled" on mobile
  // would have to manually swipe the strip to see which segment is lit.
  const stripRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!activeStage || !stripRef.current) return
    const btn = stripRef.current.querySelector<HTMLElement>(`[data-stage="${activeStage}"]`)
    btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeStage])

  return (
    <div
      className="sticky top-0 z-10 bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-sm overflow-x-auto overflow-y-hidden mb-4"
      role="navigation"
      aria-label="Pipeline summary"
      ref={stripRef}
    >
      <div className="flex snap-x snap-mandatory">
        {STAGE_ORDER.map((stage) => {
          const cards = byStage.get(stage) ?? []
          const count = cards.length
          const dollars = cards.reduce((sum, c) => sum + (c.estimated_cost ?? 0), 0)
          const meta = STAGE_META[stage]
          const Icon = meta.icon
          // Each segment claims flex-grow proportional to count. Empty
          // segments still get flex-grow: 0.4 so the bar doesn't go
          // crooked when one stage has 0 and another has 30.
          const grow = count === 0 ? 0.4 : (count / maxCount) + 0.4
          const isEmpty = count === 0
          const isActive = activeStage === stage
          return (
            <button
              key={stage}
              type="button"
              data-stage={stage}
              onClick={() => onPickStage?.(stage)}
              style={{ flexGrow: grow, flexBasis: 0 }}
              aria-pressed={isActive}
              className={`group snap-start shrink-0 min-w-[88px] text-left px-3 py-2.5 transition border-r border-gray-100 last:border-r-0 ${
                isActive
                  ? 'bg-primary-50 ring-2 ring-inset ring-primary-500'
                  : isEmpty
                    ? 'opacity-50 hover:opacity-80'
                    : 'hover:bg-gray-50'
              }`}
              aria-label={`${meta.shortLabel}: ${count} ${count === 1 ? 'lead' : 'leads'}, ${formatMoneyShort(dollars)}${isActive ? ' — currently filtered (tap to clear)' : ''}`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded ${meta.chip}`}>
                  <Icon className="w-3 h-3" />
                </span>
                <span className="text-[11px] font-semibold text-gray-700 truncate">{meta.shortLabel}</span>
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
