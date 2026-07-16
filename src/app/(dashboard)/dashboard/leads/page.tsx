'use client'

// Leads pipeline — a single deal-stage view. Desktop renders the 7-column
// KanbanBoard (drag to move stage); phones render StageList (the same
// stages stacked vertically). No command palette, smart-view chips,
// source filter, or urgency buckets — just the pipeline, easy to scan.
//
// All the persistence-heavy work (PATCH/POST orchestration, optimistic
// updates, rollback) is owned by useLeadHandlers; the page passes its
// returned `handlers` straight through to the board and every LeadCard.

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Plus, AlertTriangle, Inbox, RefreshCw } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { PipelineItem } from '@/app/api/pipeline/route'
import LeadActionSheet from '@/components/dashboard/leads/LeadActionSheet'
import KanbanBoard from '@/components/dashboard/leads/KanbanBoard'
import StageList from '@/components/dashboard/leads/StageList'
import { useLeadHandlers } from '@/components/dashboard/leads/useLeadHandlers'
import { LeadsPageSkeleton } from '@/components/dashboard/leads/LeadCardSkeleton'

export default function LeadsPage() {
  const [items, setItems] = useState<PipelineItem[]>([])
  const [counts, setCounts] = useState({ total: 0, quote_requests: 0, jobs: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Desktop gets the horizontal kanban; below 768px we stack the stages
  // vertically (a 7-column scroll is awkward on a phone). Defaults to true
  // for SSR; corrected on mount.
  const [isDesktop, setIsDesktop] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // ── Data loading ─────────────────────────────────────────────────
  const loadPipeline = useCallback(async () => {
    setError(null)
    try {
      const r = await fetch('/api/pipeline')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setItems(data.items as PipelineItem[])
      setCounts(data.counts)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      toast('Failed to load pipeline', 'error')
    }
  }, [])

  useEffect(() => {
    loadPipeline().finally(() => setLoading(false))
  }, [loadPipeline])

  // ── Handlers (extracted into a hook — see useLeadHandlers.ts) ───
  const { handlers, sheet, closeSheet, scheduleVisit, pickFollowup } = useLeadHandlers({
    items, setItems, loadPipeline,
  })

  const overdueCount = items.filter((i) => i.urgency >= 100).length

  // Loading + error states
  if (loading) return <LeadsPageSkeleton />
  if (error) return <PipelineErrorState message={error} onRetry={() => { setLoading(true); loadPipeline().finally(() => setLoading(false)) }} />

  return (
    <div className={isDesktop ? 'max-w-none' : 'max-w-2xl mx-auto'}>
      {/* Page header */}
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500 mt-1">
            {counts.total} active · {counts.quote_requests} new inquiries · {counts.jobs} active leads
            {overdueCount > 0 && <span className="text-red-600 font-medium"> · {overdueCount} overdue</span>}
          </p>
        </div>
        <Link
          href="/dashboard/leads/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Lead
        </Link>
      </div>

      {/* Deal-stage view: kanban on desktop, stacked stages on mobile. */}
      {items.length === 0 ? (
        <EmptyState />
      ) : isDesktop ? (
        <KanbanBoard items={items} handlers={handlers} />
      ) : (
        <StageList items={items} handlers={handlers} />
      )}

      {/* Single render-point for the bottom sheet. The discriminated
          union on `sheet` makes the per-mode props type-safe inside. */}
      <SheetHost
        sheet={sheet}
        onClose={closeSheet}
        scheduleVisit={scheduleVisit}
        pickFollowup={pickFollowup}
      />
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────

function SheetHost({
  sheet, onClose, scheduleVisit, pickFollowup,
}: {
  sheet: ReturnType<typeof useLeadHandlers>['sheet']
  onClose: () => void
  scheduleVisit: (item: PipelineItem, isoAt: string, notes: string | null) => Promise<void>
  pickFollowup: (item: PipelineItem, date: string | null) => Promise<void>
}) {
  if (!sheet) return null
  switch (sheet.mode) {
    case 'schedule-visit':
      return (
        <LeadActionSheet
          open
          mode="schedule-visit"
          initialAt={sheet.item.site_visit_at}
          initialNotes={sheet.item.site_visit_notes ?? null}
          customerName={sheet.item.client_name}
          onClose={onClose}
          onSave={(isoAt, notes) => scheduleVisit(sheet.item, isoAt, notes)}
        />
      )
    case 'share-estimate':
      return (
        <LeadActionSheet
          open
          mode="share-estimate"
          url={sheet.url}
          customerName={sheet.item.client_name}
          customerPhone={sheet.item.client_phone}
          onClose={onClose}
        />
      )
    case 'pick-followup':
      return (
        <LeadActionSheet
          open
          mode="pick-followup"
          initialDate={sheet.item.next_follow_up ? sheet.item.next_follow_up.slice(0, 10) : null}
          onClose={onClose}
          onSave={(d) => pickFollowup(sheet.item, d)}
        />
      )
  }
}

function PipelineErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center mt-12">
        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <h2 className="text-base font-semibold text-red-900">Couldn’t load the pipeline</h2>
        <p className="text-sm text-red-700 mt-1">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="text-center py-12">
        <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No leads in this view.</p>
        <p className="text-sm text-gray-400 mt-1">
          Click &quot;New Lead&quot; to add one, or quote-form submissions land here automatically.
        </p>
      </div>
    </div>
  )
}
