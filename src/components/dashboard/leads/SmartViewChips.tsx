'use client'

// Preset filter chips — Close.com's "Smart Views" pattern. One-tap
// switching between common work lists. Counts on each chip are live.
// Source filter is folded into the same row as a secondary dropdown.

import type { PipelineItem } from '@/app/api/pipeline/route'
import { ChevronDown } from 'lucide-react'

export type SmartView = 'all' | 'today' | 'thisWeek' | 'hotQuotes' | 'stale'

export const SMART_VIEW_LABEL: Record<SmartView, string> = {
  all: 'All',
  today: 'Today',
  thisWeek: 'This week',
  hotQuotes: 'Hot quotes',
  stale: 'Stale',
}

const SMART_VIEW_ORDER: SmartView[] = ['all', 'today', 'thisWeek', 'hotQuotes', 'stale']

// Pure filter — applied by the page before bucketize() / kanban grouping.
// Exported so chip-count computation and the actual filter use the
// same rule (one source of truth).
export function applySmartView(items: PipelineItem[], view: SmartView): PipelineItem[] {
  if (view === 'all') return items
  const weekFromNow = Date.now() + 7 * 86_400_000
  const weekAgo = Date.now() - 7 * 86_400_000
  return items.filter((it) => {
    switch (view) {
      case 'today':
        return it.urgency >= 90
      case 'thisWeek': {
        const followUpSoon =
          it.next_follow_up &&
          new Date(it.next_follow_up).getTime() <= weekFromNow
        const createdRecently = new Date(it.created_at).getTime() >= weekAgo
        return Boolean(followUpSoon || createdRecently)
      }
      case 'hotQuotes':
        return (it.stage === 'quoted' || it.stage === 'edits_needed' || it.stage === 'awaiting_response') && it.urgency < 60
      case 'stale':
        return it.urgency === 50 || it.urgency === 70
    }
  })
}

export default function SmartViewChips({
  items,
  activeView,
  onChange,
  availableSources,
  sourceFilter,
  onSourceChange,
  sourceLabels,
}: {
  items: PipelineItem[]   // post-source-filter; chip counts reflect this slice
  activeView: SmartView
  onChange: (v: SmartView) => void
  availableSources: string[]
  sourceFilter: string
  onSourceChange: (s: string) => void
  sourceLabels: Record<string, string>
}) {
  return (
    <div className="flex items-center gap-1 mb-4 overflow-x-auto -mx-1 px-1">
      {SMART_VIEW_ORDER.map((view) => {
        const count = applySmartView(items, view).length
        const active = activeView === view
        return (
          <button
            key={view}
            type="button"
            onClick={() => onChange(view)}
            className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition whitespace-nowrap ${
              active
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            aria-pressed={active}
          >
            {SMART_VIEW_LABEL[view]}
            <span className={`ml-1.5 ${active ? 'text-white/80' : 'text-gray-500'}`}>
              {count}
            </span>
          </button>
        )
      })}

      {/* Source filter — kept available as a secondary control */}
      {availableSources.length > 1 && (
        <div className="ml-auto flex-shrink-0 relative">
          <select
            value={sourceFilter}
            onChange={(e) => onSourceChange(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 border border-gray-300 rounded-full text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Filter by source"
          >
            <option value="all">All sources</option>
            {availableSources.map((s) => (
              <option key={s} value={s}>{sourceLabels[s] ?? s}</option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      )}
    </div>
  )
}
