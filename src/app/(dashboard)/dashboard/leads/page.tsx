'use client'

// Action-focused leads pipeline page (v3 polish pass).
//
// State + persistence stays here. All the persistence-heavy work
// (PATCH/POST orchestration, optimistic updates, rollback) is owned by
// useLeadHandlers; the page passes its returned `handlers` straight
// through to every LeadCard and KanbanBoard.
//
// Three persisted preferences (bucketCollapsed, viewMode, smartView)
// use useLocalStorageState — no inline useEffect boilerplate. Stage
// metadata + transitions are imported from `@/lib/leadStages` so
// every surface that renders a stage chip shows identical data.

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, AlertTriangle, Briefcase, Hourglass, Snowflake, ChevronRight,
  Inbox, LayoutGrid, List, RefreshCw, Search,
} from 'lucide-react'
import { toast } from '@/components/Toast'
import type { PipelineItem, PipelineStage } from '@/app/api/pipeline/route'
import LeadCard from '@/components/dashboard/LeadCard'
import LeadActionSheet from '@/components/dashboard/leads/LeadActionSheet'
import {
  bucketize, BUCKET_META, BUCKET_ORDER, type BucketKey, sumEstimatedCost,
} from '@/components/dashboard/leads/buckets'
import PipelineSummaryStrip from '@/components/dashboard/leads/PipelineSummaryStrip'
import SmartViewChips, { applySmartView, type SmartView } from '@/components/dashboard/leads/SmartViewChips'
import KanbanBoard from '@/components/dashboard/leads/KanbanBoard'
import { formatMoneyShort } from '@/components/dashboard/leads/formatters'
import { useLocalStorageState } from '@/lib/useLocalStorageState'
import { useLeadHandlers } from '@/components/dashboard/leads/useLeadHandlers'
import { LeadsPageSkeleton } from '@/components/dashboard/leads/LeadCardSkeleton'
import CommandPalette from '@/components/dashboard/leads/CommandPalette'

const sourceLabels: Record<string, string> = {
  website: 'Website', phone: 'Phone', referral: 'Referral',
  'walk-in': 'Walk-in', repeat: 'Repeat', other: 'Other', notion_import: 'Notion import',
}

const COLLAPSED_KEY = 'leads_buckets_collapsed_v1'
const VIEW_MODE_KEY = 'leads_view_mode_v1'
const SMART_VIEW_KEY = 'leads_smart_view_v1'

type ViewMode = 'cards' | 'kanban'

const BUCKET_ICONS: Record<BucketKey, typeof AlertTriangle> = {
  actionNeeded: AlertTriangle,
  working: Briefcase,
  waiting: Hourglass,
  stale: Snowflake,
}

export default function LeadsPage() {
  const router = useRouter()
  const [items, setItems] = useState<PipelineItem[]>([])
  const [counts, setCounts] = useState({ total: 0, quote_requests: 0, jobs: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [focusedStage, setFocusedStage] = useState<PipelineStage | null>(null)

  const [paletteOpen, setPaletteOpen] = useState(false)

  const [bucketCollapsed, setBucketCollapsed] = useLocalStorageState<Partial<Record<BucketKey, boolean>>>(
    COLLAPSED_KEY,
    {},
    (v): v is Partial<Record<BucketKey, boolean>> => typeof v === 'object' && v !== null && !Array.isArray(v),
  )
  const [viewMode, setViewMode] = useLocalStorageState<ViewMode>(
    VIEW_MODE_KEY,
    'cards',
    (v): v is ViewMode => v === 'cards' || v === 'kanban',
  )
  const [smartView, setSmartView] = useLocalStorageState<SmartView>(
    SMART_VIEW_KEY,
    'all',
    (v): v is SmartView => v === 'all' || v === 'today' || v === 'thisWeek' || v === 'hotQuotes' || v === 'stale',
  )

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

  // C1: global Cmd-K / Ctrl-K opens the command palette. Slash also
  // opens it (Linear/Notion convention) — except while the user is
  // typing in an input, so we don't hijack the regular '/' key.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMeta = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')
      const isSlash = e.key === '/' && !isTypingInInput(e.target)
      if (isMeta || isSlash) {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // ── Handlers (extracted into a hook — see useLeadHandlers.ts) ───
  const { handlers, sheet, closeSheet, scheduleVisit, pickFollowup } = useLeadHandlers({
    items, setItems, loadPipeline,
  })

  // ── Source filter + Smart View filter + bucketize ──────────────
  const availableSources = useMemo(() => {
    const set = new Set<string>()
    for (const i of items) if (i.source) set.add(i.source)
    return Array.from(set).sort()
  }, [items])

  const sourceFiltered = useMemo(
    () => items.filter((i) => sourceFilter === 'all' || (i.source ?? 'website') === sourceFilter),
    [items, sourceFilter],
  )
  const filtered = useMemo(
    () => applySmartView(sourceFiltered, smartView),
    [sourceFiltered, smartView],
  )

  const buckets = useMemo(() => bucketize(filtered), [filtered])
  const overdueCount = items.filter((i) => i.urgency >= 100).length

  function handlePickStage(stage: PipelineStage) {
    setFocusedStage(stage)
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
      setViewMode('kanban')
    }
    setTimeout(() => setFocusedStage(null), 800)
  }

  function toggleBucket(key: BucketKey) {
    setBucketCollapsed((prev) => {
      const wasOpen = !(prev[key] ?? !BUCKET_META[key].defaultOpen)
      return { ...prev, [key]: wasOpen }
    })
  }

  // Loading + error states
  if (loading) return <LeadsPageSkeleton />
  if (error) return <PipelineErrorState message={error} onRetry={() => { setLoading(true); loadPipeline().finally(() => setLoading(false)) }} />

  const effectiveViewMode: ViewMode = viewMode === 'kanban' ? 'kanban' : 'cards'

  return (
    <div className={effectiveViewMode === 'kanban' ? 'max-w-none' : 'max-w-2xl mx-auto'}>
      {/* Page header */}
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500 mt-1">
            {counts.total} active · {counts.quote_requests} new inquiries · {counts.jobs} active leads
            {overdueCount > 0 && <span className="text-red-600 font-medium"> · {overdueCount} overdue</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* C1: search trigger — keyboard users can hit Cmd/Ctrl+K or /
              instead; this button covers mobile where there's no
              keyboard shortcut path. */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
            aria-label="Search leads"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden md:inline text-[10px] text-gray-500 border border-gray-300 rounded px-1 ml-1">⌘K</kbd>
          </button>
          <div className="hidden md:inline-flex bg-gray-100 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md ${
                effectiveViewMode === 'cards' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
              aria-pressed={effectiveViewMode === 'cards'}
            >
              <List className="w-4 h-4" />
              Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md ${
                effectiveViewMode === 'kanban' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
              aria-pressed={effectiveViewMode === 'kanban'}
            >
              <LayoutGrid className="w-4 h-4" />
              Kanban
            </button>
          </div>
          <Link
            href="/dashboard/leads/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Lead
          </Link>
        </div>
      </div>

      {/* Pipeline summary strip (click a segment → jump to kanban column) */}
      <PipelineSummaryStrip items={items} onPickStage={handlePickStage} />

      {/* Smart View chips + source filter folded into the same row */}
      <SmartViewChips
        items={sourceFiltered}
        activeView={smartView}
        onChange={setSmartView}
        availableSources={availableSources}
        sourceFilter={sourceFilter}
        onSourceChange={setSourceFilter}
        sourceLabels={sourceLabels}
      />

      {/* View body: bucketed card stream OR kanban board */}
      {filtered.length === 0 ? (
        <EmptyState />
      ) : effectiveViewMode === 'kanban' ? (
        <KanbanBoard items={filtered} handlers={handlers} focusedStage={focusedStage} />
      ) : (
        BUCKET_ORDER.map((key) => {
          const cards = buckets[key]
          if (cards.length === 0) return null
          const meta = BUCKET_META[key]
          const collapsed = bucketCollapsed[key] ?? !meta.defaultOpen
          const Icon = BUCKET_ICONS[key]
          const bucketDollars = sumEstimatedCost(cards)
          return (
            <section key={key} className="mb-6">
              <button
                type="button"
                onClick={() => toggleBucket(key)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border ${meta.tint.container} bg-white hover:bg-gray-50 transition`}
                aria-expanded={!collapsed}
              >
                <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${meta.tint.iconBg}`}>
                  <Icon className={`w-4 h-4 ${meta.tint.iconText}`} />
                </div>
                <div className="flex-1 text-left">
                  <h2 className="text-sm font-semibold text-gray-900">{meta.label}</h2>
                  <p className="text-[11px] text-gray-500">{meta.hint}</p>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className={`inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full text-xs font-semibold ${meta.tint.countBg}`}>
                    {cards.length}
                  </span>
                  {bucketDollars > 0 && (
                    <span className="text-[10px] text-gray-500 leading-none">{formatMoneyShort(bucketDollars)}</span>
                  )}
                </div>
                <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
              </button>
              {/* B2: animated collapse via grid-template-rows: 0fr ↔ 1fr.
                  Browsers that don't support animating grid rows (old
                  Safari) fall back to an instant toggle — graceful. */}
              <div
                className="grid transition-[grid-template-rows] duration-200 ease-out"
                style={{ gridTemplateRows: collapsed ? '0fr' : '1fr' }}
                aria-hidden={collapsed}
              >
                <div className="overflow-hidden">
                  <div className="space-y-3 mt-3">
                    {cards.map((item) => (
                      <LeadCard key={`${item.kind}-${item.id}`} item={item} handlers={handlers} />
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )
        })
      )}

      {/* A6: single render-point for the bottom sheet. The discriminated
          union on `sheet` makes the per-mode props type-safe inside. */}
      <SheetHost
        sheet={sheet}
        onClose={closeSheet}
        scheduleVisit={scheduleVisit}
        pickFollowup={pickFollowup}
      />

      {/* C1: command palette (Cmd/Ctrl+K, /, or the Search button) */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={items}
        onMarkContacted={handlers.markContactedNow}
        onPickFollowupQuick={(item) => {
          const d = new Date()
          d.setDate(d.getDate() + 7)
          return pickFollowup(item, d.toISOString().slice(0, 10))
        }}
      />
    </div>
  )
}

// Don't hijack '/' when the user is typing in an input/textarea/contenteditable.
function isTypingInInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
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
