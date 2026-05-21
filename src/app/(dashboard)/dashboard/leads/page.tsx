'use client'

// Action-focused redesign of /dashboard/leads. Replaces the dense
// 8-column table with bucketed `<LeadCard>` stream — see
// C:\Users\vince\.claude\plans\typed-soaring-cloud.md for the design.
//
// State + persistence stays here. <LeadCard> is dumb and only fires
// callbacks. Three flows that need a bigger input surface (schedule
// visit, share estimate link, pick follow-up date) open a shared
// <LeadActionSheet>.

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Inbox, Plus, AlertTriangle, Briefcase, Hourglass, Snowflake, ChevronRight,
  FileText, Calendar, FilePlus, FileCheck, LayoutGrid, List,
} from 'lucide-react'
import { toast } from '@/components/Toast'
import { type StageOption } from '@/components/dashboard/InlineEditCells'
import type { PipelineItem, PipelineStage } from '@/app/api/pipeline/route'
import LeadCard, { type LeadCardHandlers } from '@/components/dashboard/LeadCard'
import LeadActionSheet from '@/components/dashboard/leads/LeadActionSheet'
import {
  bucketize, BUCKET_META, BUCKET_ORDER, type BucketKey, sumEstimatedCost,
} from '@/components/dashboard/leads/buckets'
import PipelineSummaryStrip from '@/components/dashboard/leads/PipelineSummaryStrip'
import SmartViewChips, { applySmartView, type SmartView } from '@/components/dashboard/leads/SmartViewChips'
import KanbanBoard from '@/components/dashboard/leads/KanbanBoard'
import { formatMoneyShort } from '@/components/dashboard/leads/formatters'

// stageMeta drives the chip colors/labels/icons. Single source of truth
// the EditableStageCell consumes via stageOptionsFor() below.
const stageMeta: Record<PipelineStage, { label: string; color: string; icon: typeof Inbox }> = {
  new:               { label: 'New inquiry',     color: 'bg-blue-100 text-blue-700',     icon: Inbox },
  reviewed:          { label: 'Reviewed',        color: 'bg-yellow-100 text-yellow-800', icon: FileText },
  visit_scheduled:   { label: 'Visit scheduled', color: 'bg-amber-100 text-amber-800',   icon: Calendar },
  lead_in_progress:  { label: 'Active lead',     color: 'bg-indigo-100 text-indigo-800', icon: FileText },
  estimate_sent:     { label: 'Estimate sent',   color: 'bg-purple-100 text-purple-800', icon: FilePlus },
  estimate_revised:  { label: 'Estimate revised', color: 'bg-pink-100 text-pink-800',    icon: FileCheck },
}

const PIPELINE_STAGES: PipelineStage[] = [
  'new', 'reviewed', 'visit_scheduled',
  'lead_in_progress', 'estimate_sent', 'estimate_revised',
]

// QR rows can pick any stage (job-stages auto-convert via /api/leads/{id}/convert).
// Job rows can only switch among job-stages — moving back to a QR stage would
// require un-converting, which the API doesn't support, so those options are
// shown but disabled (with a tooltip).
function stageOptionsFor(item: PipelineItem): StageOption<PipelineStage>[] {
  return PIPELINE_STAGES.map((stage) => {
    const meta = stageMeta[stage]
    const isQrStage = stage === 'new' || stage === 'reviewed' || stage === 'visit_scheduled'
    const disabled = item.kind === 'job' && isQrStage
    return {
      stage,
      label: meta.label,
      color: meta.color,
      icon: meta.icon,
      disabled,
      disabledReason: disabled
        ? 'Job already created — moving back to an inquiry stage isn’t supported. Use Archive to remove from the pipeline.'
        : undefined,
    }
  })
}

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

// Sheet state is a discriminated union — only one sheet open at a time.
type SheetState =
  | { mode: 'schedule-visit'; item: PipelineItem }
  | { mode: 'share-estimate'; item: PipelineItem; url: string }
  | { mode: 'pick-followup';  item: PipelineItem }
  | null

export default function LeadsPage() {
  const router = useRouter()
  const [items, setItems] = useState<PipelineItem[]>([])
  const [counts, setCounts] = useState({ total: 0, quote_requests: 0, jobs: 0 })
  const [loading, setLoading] = useState(true)
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [bucketCollapsed, setBucketCollapsed] = useState<Partial<Record<BucketKey, boolean>>>({})
  const [sheet, setSheet] = useState<SheetState>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [smartView, setSmartView] = useState<SmartView>('all')
  // Set when the user clicks a segment in the pipeline summary strip
  // (or the eventual filter-by-stage from a chip click). Drives kanban
  // column scroll-into-view. Reset to null after one render so the
  // scroll doesn't fire on every re-render.
  const [focusedStage, setFocusedStage] = useState<PipelineStage | null>(null)

  // ── Data loading ─────────────────────────────────────────────────
  const loadPipeline = useCallback(async () => {
    try {
      const r = await fetch('/api/pipeline')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setItems(data.items as PipelineItem[])
      setCounts(data.counts)
    } catch {
      toast('Failed to load pipeline', 'error')
    }
  }, [])

  useEffect(() => {
    loadPipeline().finally(() => setLoading(false))
  }, [loadPipeline])

  // ── Persistence: bucket-collapsed, viewMode, smartView ──────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY)
      if (raw) setBucketCollapsed(JSON.parse(raw))
      const vm = localStorage.getItem(VIEW_MODE_KEY)
      if (vm === 'cards' || vm === 'kanban') setViewMode(vm)
      const sv = localStorage.getItem(SMART_VIEW_KEY)
      if (sv === 'all' || sv === 'today' || sv === 'thisWeek' || sv === 'hotQuotes' || sv === 'stale') {
        setSmartView(sv)
      }
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(bucketCollapsed)) } catch { /* ignore */ }
  }, [bucketCollapsed])
  useEffect(() => {
    try { localStorage.setItem(VIEW_MODE_KEY, viewMode) } catch { /* ignore */ }
  }, [viewMode])
  useEffect(() => {
    try { localStorage.setItem(SMART_VIEW_KEY, smartView) } catch { /* ignore */ }
  }, [smartView])

  // ── Optimistic local-update helper used by all PATCH-style handlers
  function updateItemLocally(itemId: string, kind: 'quote_request' | 'job', patch: Partial<PipelineItem>) {
    setItems((prev) => prev.map((it) => (it.id === itemId && it.kind === kind ? { ...it, ...patch } : it)))
  }

  // ── Stage editor (re-used from the prior pass) ────────────────────
  async function saveStage(item: PipelineItem, newStage: PipelineStage) {
    // Same-table: QR → QR stage
    if (item.kind === 'quote_request' && (newStage === 'new' || newStage === 'reviewed' || newStage === 'visit_scheduled')) {
      let patch: Record<string, unknown>
      let local: Partial<PipelineItem>
      if (newStage === 'visit_scheduled') {
        // If no existing site_visit_at, prompt for a date. Anything more
        // elaborate (the bottom-sheet picker) is reachable via the
        // primary CTA on a `reviewed` card.
        let dt = item.site_visit_at
        if (!dt) {
          const input = window.prompt('When is the site visit?\n(YYYY-MM-DD HH:MM, e.g. 2026-05-22 14:00)')
          if (!input) return
          const parsed = new Date(input.replace(' ', 'T'))
          if (Number.isNaN(parsed.getTime())) { toast('Invalid date format', 'error'); return }
          dt = parsed.toISOString()
        }
        patch = { site_visit_at: dt }
        local = { stage: 'visit_scheduled', site_visit_at: dt }
      } else {
        patch = { status: newStage, site_visit_at: null }
        local = { stage: newStage, site_visit_at: null }
      }
      const prev = { stage: item.stage, site_visit_at: item.site_visit_at }
      updateItemLocally(item.id, 'quote_request', local)
      const res = await fetch(`/api/leads/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      if (!res.ok) { updateItemLocally(item.id, 'quote_request', prev as Partial<PipelineItem>); throw new Error(`Stage save failed: ${res.status}`) }
      return
    }
    // Same-table: Job → Job stage
    if (item.kind === 'job' && (newStage === 'lead_in_progress' || newStage === 'estimate_sent' || newStage === 'estimate_revised')) {
      const jobStatus = newStage === 'lead_in_progress' ? 'lead' : newStage === 'estimate_sent' ? 'quoted' : 'estimate_revised'
      const prev = { stage: item.stage, job_status: item.job_status }
      updateItemLocally(item.id, 'job', { stage: newStage, job_status: jobStatus })
      const res = await fetch(`/api/jobs/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: jobStatus }),
      })
      if (!res.ok) { updateItemLocally(item.id, 'job', prev as Partial<PipelineItem>); throw new Error(`Stage save failed: ${res.status}`) }
      return
    }
    // Cross-table: QR → Job stage (auto-promote)
    if (item.kind === 'quote_request') {
      const convertRes = await fetch(`/api/leads/${item.id}/convert`, { method: 'POST' })
      const convertData = await convertRes.json()
      if (!convertRes.ok) throw new Error(convertData.error ?? 'Conversion failed')
      const newJobId: string = convertData.job?.id
      const targetJobStatus = newStage === 'lead_in_progress' ? 'lead' : newStage === 'estimate_sent' ? 'quoted' : 'estimate_revised'
      if (newJobId && targetJobStatus !== 'lead') {
        await fetch(`/api/jobs/${newJobId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: targetJobStatus }),
        })
      }
      await loadPipeline()
      toast('Lead promoted to job', 'success')
      return
    }
    // Backward (job → QR): disallowed
    throw new Error('Cannot move a job back to inquiry stage. Use Archive instead.')
  }

  // ── Notes ──────────────────────────────────────────────────────────
  async function saveNotes(item: PipelineItem, newValue: string | null) {
    const path = item.kind === 'quote_request' ? `/api/leads/${item.id}` : `/api/jobs/${item.id}`
    updateItemLocally(item.id, item.kind, { notes: newValue })
    const res = await fetch(path, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: newValue }),
    })
    if (!res.ok) { updateItemLocally(item.id, item.kind, { notes: item.notes }); throw new Error(`Save failed: ${res.status}`) }
  }

  // ── Mark contacted now ────────────────────────────────────────────
  async function markContactedNow(item: PipelineItem) {
    const targetQrId = item.kind === 'quote_request' ? item.id : item.linked_quote_request_id
    if (!targetQrId) { toast('No editable lead record for this row', 'error'); return }
    const now = new Date().toISOString()
    updateItemLocally(item.id, item.kind, { last_contact_at: now })
    const res = await fetch(`/api/leads/${targetQrId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ last_contact_at: now }),
    })
    if (!res.ok) {
      updateItemLocally(item.id, item.kind, { last_contact_at: item.last_contact_at })
      toast('Failed to mark contacted', 'error')
      return
    }
    toast('Marked contacted just now', 'success')
  }

  // ── Archive (QR-only) ─────────────────────────────────────────────
  async function archiveLead(item: PipelineItem) {
    if (item.kind !== 'quote_request') return
    if (!confirm(`Archive ${item.client_name}'s inquiry? They'll move out of the active pipeline.`)) return
    setItems((prev) => prev.filter((i) => !(i.id === item.id && i.kind === 'quote_request')))
    const res = await fetch(`/api/leads/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'archived' }),
    })
    if (!res.ok) { toast('Failed to archive — refresh to recover', 'error'); return }
    toast('Archived', 'success')
  }

  // ── Send to Jobs (customer accepted — locks deal) ────────────────
  async function sendToJobs(item: PipelineItem) {
    if (item.kind !== 'job') return
    if (!confirm(`Mark ${item.project_name} as accepted? This moves it to the operations workflow.`)) return
    setItems((prev) => prev.filter((i) => !(i.id === item.id && i.kind === 'job')))
    const res = await fetch(`/api/jobs/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'accepted_not_scheduled' }),
    })
    if (!res.ok) { toast('Failed to advance — refresh to recover', 'error'); return }
    toast('Sent to Jobs', 'success')
    router.push(`/dashboard/jobs/${item.id}`)
  }

  // ── Convert (manual override; QR-only) ────────────────────────────
  async function convertLead(item: PipelineItem) {
    if (item.kind !== 'quote_request') return
    try {
      const res = await fetch(`/api/leads/${item.id}/convert`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409 && data.existing_job_id) {
          toast('Lead already converted — opening job', 'success')
          router.push(`/dashboard/jobs/${data.existing_job_id}`)
          return
        }
        throw new Error(data.error || 'Failed to convert')
      }
      toast('Job created — pick a template, use Claude, or edit line items', 'success')
      router.push(`/dashboard/jobs/${data.job.id}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Conversion failed', 'error')
    }
  }

  // ── Schedule visit (sheet-driven) ─────────────────────────────────
  async function scheduleVisit(item: PipelineItem, isoAt: string, notes: string | null) {
    const targetQrId = item.kind === 'quote_request' ? item.id : item.linked_quote_request_id
    if (!targetQrId) throw new Error('No editable lead record for this row')
    const prev = { stage: item.stage, site_visit_at: item.site_visit_at, site_visit_notes: item.site_visit_notes }
    updateItemLocally(item.id, item.kind, { site_visit_at: isoAt, site_visit_notes: notes, stage: 'visit_scheduled' })
    const res = await fetch(`/api/leads/${targetQrId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ site_visit_at: isoAt, site_visit_notes: notes }),
    })
    if (!res.ok) { updateItemLocally(item.id, item.kind, prev as Partial<PipelineItem>); throw new Error(`Save failed: ${res.status}`) }
  }

  // ── Pick follow-up (sheet-driven) ─────────────────────────────────
  async function pickFollowup(item: PipelineItem, date: string | null) {
    const targetQrId = item.kind === 'quote_request' ? item.id : item.linked_quote_request_id
    if (!targetQrId) throw new Error('No editable lead record for this row')
    updateItemLocally(item.id, item.kind, { next_follow_up: date })
    const res = await fetch(`/api/leads/${targetQrId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ next_follow_up: date }),
    })
    if (!res.ok) { updateItemLocally(item.id, item.kind, { next_follow_up: item.next_follow_up }); throw new Error(`Save failed: ${res.status}`) }
  }

  // ── Open the share-estimate sheet (generates the link first) ─────
  async function openShareEstimate(item: PipelineItem) {
    if (item.kind !== 'job') {
      toast('Convert this lead to a job first', 'error')
      return
    }
    try {
      const res = await fetch(`/api/jobs/${item.id}/estimate-link`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate link')
      setSheet({ mode: 'share-estimate', item, url: data.url })
      // The endpoint flips the job to 'quoted' the first time; pull fresh state
      await loadPipeline()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not generate link', 'error')
    }
  }

  const handlers: LeadCardHandlers = {
    saveStage, saveNotes, markContactedNow, archiveLead, convertLead, sendToJobs,
    openScheduleVisit: (item) => setSheet({ mode: 'schedule-visit', item }),
    openShareEstimate,
    openPickFollowup: (item) => setSheet({ mode: 'pick-followup', item }),
    stageOptionsFor,
  }

  // ── Source filter + Smart View filter + bucketize ──────────────
  const availableSources = useMemo(() => {
    const set = new Set<string>()
    for (const i of items) if (i.source) set.add(i.source)
    return Array.from(set).sort()
  }, [items])

  // Source filter first (the "physical" filter on intake channel), then
  // Smart View filter on top (the "work-list" filter). Chip counts in
  // SmartViewChips reflect counts after the source filter has applied.
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
    // On md+, switch to kanban so the focused column is visible.
    // On mobile we just set the state — kanban isn't rendered there,
    // but the focus is harmless.
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
      setViewMode('kanban')
    }
    // Clear focus after a short delay so re-renders don't keep
    // re-scrolling. 800ms is enough for the smooth scroll to settle.
    setTimeout(() => setFocusedStage(null), 800)
  }

  function toggleBucket(key: BucketKey) {
    setBucketCollapsed((prev) => {
      const wasOpen = !(prev[key] ?? !BUCKET_META[key].defaultOpen)
      return { ...prev, [key]: wasOpen }
    })
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading pipeline…</div>
  }

  // Kanban is desktop-only — at md+ we render the toggle and let the
  // user pick; below md we force the cards view regardless of stored
  // preference. Effective view = stored choice clamped by viewport.
  const effectiveViewMode: ViewMode = viewMode === 'kanban' ? 'kanban' : 'cards'

  return (
    <div className={effectiveViewMode === 'kanban' ? 'max-w-none' : 'max-w-2xl mx-auto'}>
      {/* Page header */}
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500 mt-1">
            {counts.total} active · {counts.quote_requests} new inquiries · {counts.jobs} active leads
            {overdueCount > 0 && (
              <span className="text-red-600 font-medium"> · {overdueCount} overdue</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Cards | Kanban toggle — desktop only. Cards view is
              the muscle-memory default; kanban is the new "where is
              everything" pipeline visualization. */}
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

      {/* Pipeline summary strip — Pipedrive/HubSpot pattern. One-glance
          distribution across stages. Click jumps to that column in kanban. */}
      <PipelineSummaryStrip items={items} onPickStage={handlePickStage} />

      {/* Smart Views — Close.com pattern. Source filter folded into the right side. */}
      <SmartViewChips
        items={sourceFiltered}
        activeView={smartView}
        onChange={setSmartView}
        availableSources={availableSources}
        sourceFilter={sourceFilter}
        onSourceChange={setSourceFilter}
        sourceLabels={sourceLabels}
      />

      {/* View body — bucketed card stream OR kanban board */}
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
              {!collapsed && (
                <div className="space-y-3 mt-3">
                  {cards.map((item) => (
                    <LeadCard key={`${item.kind}-${item.id}`} item={item} handlers={handlers} />
                  ))}
                </div>
              )}
            </section>
          )
        })
      )}

      {/* Active bottom sheet */}
      {sheet?.mode === 'schedule-visit' && (
        <LeadActionSheet
          open
          mode="schedule-visit"
          initialAt={sheet.item.site_visit_at}
          initialNotes={sheet.item.site_visit_notes ?? null}
          customerName={sheet.item.client_name}
          onClose={() => setSheet(null)}
          onSave={(isoAt, notes) => scheduleVisit(sheet.item, isoAt, notes)}
        />
      )}
      {sheet?.mode === 'share-estimate' && (
        <LeadActionSheet
          open
          mode="share-estimate"
          url={sheet.url}
          customerName={sheet.item.client_name}
          customerPhone={sheet.item.client_phone}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.mode === 'pick-followup' && (
        <LeadActionSheet
          open
          mode="pick-followup"
          initialDate={sheet.item.next_follow_up ? sheet.item.next_follow_up.slice(0, 10) : null}
          onClose={() => setSheet(null)}
          onSave={(d) => pickFollowup(sheet.item, d)}
        />
      )}
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
