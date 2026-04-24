'use client'

import { useState, useEffect, useMemo, Fragment } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Inbox, ArrowRight, AlertCircle, Sparkles, Loader2, Plus, Clock,
  Calendar, FileText, FilePlus, FileCheck, Archive, Send, ChevronRight,
  ChevronDown, MapPin, Phone, Mail,
} from 'lucide-react'
import { toast } from '@/components/Toast'
import { EditableDateCell, EditableNotesCell } from '@/components/dashboard/InlineEditCells'

// Mirrors PipelineItem in /api/pipeline/route.ts.
type PipelineStage =
  | 'new' | 'reviewed' | 'visit_scheduled'
  | 'lead_in_progress' | 'estimate_sent' | 'estimate_revised'

type PipelineItem = {
  kind: 'quote_request' | 'job'
  id: string
  project_name: string
  client_name: string
  client_phone: string | null
  client_email: string | null
  client_address: string | null
  source: string | null
  stage: PipelineStage
  estimated_cost: number | null
  site_visit_at: string | null
  next_follow_up: string | null
  last_contact_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  urgency: number
  job_number?: number
  job_status?: string
  linked_quote_request_id?: string | null
  project_type?: string
  description?: string | null
  site_visit_notes?: string | null
  customer_answers?: Record<string, string> | null
  scope_notes_excerpt?: string | null
}

const stageMeta: Record<PipelineStage, { label: string; color: string; icon: typeof Inbox }> = {
  new: { label: 'New inquiry', color: 'bg-blue-100 text-blue-700', icon: Inbox },
  reviewed: { label: 'Reviewed', color: 'bg-yellow-100 text-yellow-800', icon: FileText },
  visit_scheduled: { label: 'Visit scheduled', color: 'bg-amber-100 text-amber-800', icon: Calendar },
  lead_in_progress: { label: 'Active lead', color: 'bg-indigo-100 text-indigo-800', icon: FileText },
  estimate_sent: { label: 'Estimate sent', color: 'bg-purple-100 text-purple-800', icon: FilePlus },
  estimate_revised: { label: 'Estimate revised', color: 'bg-pink-100 text-pink-800', icon: FileCheck },
}

const sourceLabels: Record<string, string> = {
  website: 'Website',
  phone: 'Phone',
  referral: 'Referral',
  'walk-in': 'Walk-in',
  repeat: 'Repeat',
  other: 'Other',
  notion_import: 'Notion import',
}

function urgencyBadge(item: PipelineItem): { label: string; className: string } | null {
  if (item.urgency >= 100) return { label: 'Follow-up overdue', className: 'bg-red-50 text-red-700 border border-red-200' }
  if (item.urgency >= 95) return { label: 'Visit was yesterday', className: 'bg-red-50 text-red-700 border border-red-200' }
  if (item.urgency >= 90) return { label: 'Visit today', className: 'bg-orange-50 text-orange-700 border border-orange-200' }
  if (item.urgency >= 70) return { label: 'Stale (2+ weeks)', className: 'bg-amber-50 text-amber-700 border border-amber-200' }
  if (item.urgency >= 60) return { label: 'Just arrived', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' }
  if (item.urgency >= 50) return { label: 'Stale (1+ week)', className: 'bg-yellow-50 text-yellow-700 border border-yellow-200' }
  return null
}

function formatDateShort(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatVisitDateTime(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

export default function LeadsPage() {
  const router = useRouter()
  const [items, setItems] = useState<PipelineItem[]>([])
  const [counts, setCounts] = useState({ total: 0, quote_requests: 0, jobs: 0 })
  const [loading, setLoading] = useState(true)
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [stageFilter, setStageFilter] = useState<'all' | PipelineStage>('all')
  const [convertingId, setConvertingId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/pipeline')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        setItems(data.items as PipelineItem[])
        setCounts(data.counts)
      })
      .catch(() => toast('Failed to load pipeline', 'error'))
      .finally(() => setLoading(false))
  }, [])

  async function convertLead(leadId: string) {
    setConvertingId(leadId)
    try {
      const res = await fetch(`/api/leads/${leadId}/convert`, { method: 'POST' })
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
      setConvertingId(null)
    }
  }

  // Update a row optimistically and then PATCH the right backend record.
  // Date fields live on quote_requests; for jobs we route through the linked
  // QR if present (jobs without one have read-only date cells). Notes can be
  // PATCHed on either record.
  function updateItemLocally(itemId: string, kind: 'quote_request' | 'job', patch: Partial<PipelineItem>) {
    setItems((prev) =>
      prev.map((it) => (it.id === itemId && it.kind === kind ? { ...it, ...patch } : it))
    )
  }

  async function saveDate(item: PipelineItem, field: 'last_contact_at' | 'next_follow_up', newValue: string | null) {
    const targetQrId = item.kind === 'quote_request' ? item.id : item.linked_quote_request_id
    if (!targetQrId) throw new Error('No editable lead record for this row')
    // Optimistic update first
    updateItemLocally(item.id, item.kind, { [field]: newValue } as Partial<PipelineItem>)
    const res = await fetch(`/api/leads/${targetQrId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: newValue }),
    })
    if (!res.ok) {
      // Rollback
      updateItemLocally(item.id, item.kind, { [field]: item[field] } as Partial<PipelineItem>)
      throw new Error(`Save failed: ${res.status}`)
    }
  }

  async function saveNotes(item: PipelineItem, newValue: string | null) {
    // Notes route to the underlying record kind
    const path = item.kind === 'quote_request' ? `/api/leads/${item.id}` : `/api/jobs/${item.id}`
    updateItemLocally(item.id, item.kind, { notes: newValue })
    const res = await fetch(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: newValue }),
    })
    if (!res.ok) {
      updateItemLocally(item.id, item.kind, { notes: item.notes })
      throw new Error(`Save failed: ${res.status}`)
    }
  }

  // ── Quick actions ──────────────────────────────────────────────────
  // Each one is an optimistic local update + PATCH; failures roll back.

  async function markContactedNow(item: PipelineItem) {
    const targetQrId = item.kind === 'quote_request' ? item.id : item.linked_quote_request_id
    if (!targetQrId) {
      toast('No editable lead record for this row', 'error')
      return
    }
    const now = new Date().toISOString()
    updateItemLocally(item.id, item.kind, { last_contact_at: now })
    const res = await fetch(`/api/leads/${targetQrId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ last_contact_at: now }),
    })
    if (!res.ok) {
      updateItemLocally(item.id, item.kind, { last_contact_at: item.last_contact_at })
      toast('Failed to mark contacted', 'error')
      return
    }
    toast('Marked contacted just now', 'success')
  }

  async function archiveLead(item: PipelineItem) {
    if (item.kind !== 'quote_request') return
    if (!confirm(`Archive ${item.client_name}'s inquiry? They'll move out of the active pipeline.`)) return
    setItems((prev) => prev.filter((i) => !(i.id === item.id && i.kind === 'quote_request')))
    const res = await fetch(`/api/leads/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
    if (!res.ok) {
      toast('Failed to archive — refresh to recover', 'error')
      return
    }
    toast('Archived', 'success')
  }

  async function sendToJobs(item: PipelineItem) {
    if (item.kind !== 'job') return
    if (!confirm(`Send ${item.project_name} to Jobs? This locks the deal as accepted and moves it to the operations workflow.`)) return
    // Optimistic: remove from pipeline (it'll show on Jobs page)
    setItems((prev) => prev.filter((i) => !(i.id === item.id && i.kind === 'job')))
    const res = await fetch(`/api/jobs/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'accepted_not_scheduled' }),
    })
    if (!res.ok) {
      toast('Failed to advance — refresh to recover', 'error')
      return
    }
    toast('Sent to Jobs', 'success')
    router.push(`/dashboard/jobs/${item.id}`)
  }

  // ── Expandable row state ───────────────────────────────────────────
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  function toggleExpand(item: PipelineItem) {
    const key = `${item.kind}-${item.id}`
    setExpandedKey((prev) => (prev === key ? null : key))
  }

  const availableSources = useMemo(() => {
    const set = new Set<string>()
    for (const i of items) if (i.source) set.add(i.source)
    return Array.from(set).sort()
  }, [items])

  const stageCounts = useMemo(() => {
    const map = new Map<PipelineStage, number>()
    for (const i of items) map.set(i.stage, (map.get(i.stage) ?? 0) + 1)
    return map
  }, [items])

  const overdueCount = items.filter((i) => i.urgency >= 100).length

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (stageFilter !== 'all' && i.stage !== stageFilter) return false
      if (sourceFilter !== 'all' && (i.source ?? 'website') !== sourceFilter) return false
      return true
    })
  }, [items, stageFilter, sourceFilter])

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading pipeline…</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500 mt-1">
            {counts.total} active in pipeline · {counts.quote_requests} new inquiries · {counts.jobs} active leads
            {overdueCount > 0 && (
              <span className="text-red-600 font-medium"> · {overdueCount} overdue</span>
            )}
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

      {/* Stage filter chips */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4 overflow-x-auto">
        <button
          onClick={() => setStageFilter('all')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
            stageFilter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          All ({items.length})
        </button>
        {(Object.keys(stageMeta) as PipelineStage[]).map((stage) => {
          const count = stageCounts.get(stage) ?? 0
          if (count === 0) return null
          const meta = stageMeta[stage]
          return (
            <button
              key={stage}
              onClick={() => setStageFilter(stage)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                stageFilter === stage ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {meta.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Source filter (right-aligned) */}
      {availableSources.length > 0 && (
        <div className="flex justify-end mb-3">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
          >
            <option value="all">All sources</option>
            {availableSources.map((s) => (
              <option key={s} value={s}>{sourceLabels[s] ?? s}</option>
            ))}
          </select>
        </div>
      )}

      {/* Compact table view */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Desktop table — Project / Customer / Stage / Activity / Action */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="w-px px-2 py-2"></th>
                <th className="text-left px-4 py-2">Project</th>
                <th className="text-left px-4 py-2">Customer</th>
                <th className="text-left px-4 py-2">Stage</th>
                <th className="text-left px-4 py-2 whitespace-nowrap">Last contact</th>
                <th className="text-left px-4 py-2 whitespace-nowrap">Next follow-up</th>
                <th className="text-left px-4 py-2 min-w-[180px]">Notes / brainstorm</th>
                <th className="text-right px-4 py-2 w-px">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((item) => {
                const meta = stageMeta[item.stage]
                const StageIcon = meta.icon
                const urgency = urgencyBadge(item)
                // Open detail by clicking the project name; everything else
                // is in-place editable so the row itself isn't navigation.
                const detailHref = `/dashboard/leads/${item.id}`
                const dateEditable =
                  item.kind === 'quote_request' || !!item.linked_quote_request_id
                const expanded = expandedKey === `${item.kind}-${item.id}`
                return (
                  <Fragment key={`${item.kind}-${item.id}`}>
                  <tr className="hover:bg-gray-50">
                    {/* EXPAND CHEVRON */}
                    <td className="px-2 py-2.5 align-top">
                      <button
                        onClick={() => toggleExpand(item)}
                        className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700"
                        title={expanded ? 'Collapse' : 'Expand'}
                        aria-label={expanded ? 'Collapse row' : 'Expand row'}
                      >
                        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </td>

                    {/* PROJECT — primary column, click to open detail */}
                    <td className="px-4 py-2.5 align-top">
                      <Link
                        href={detailHref}
                        className="block font-medium text-gray-900 hover:text-primary-700 truncate max-w-[300px]"
                        title={item.project_name}
                      >
                        {item.project_name}
                      </Link>
                      {item.estimated_cost != null && item.estimated_cost > 0 && (
                        <div className="text-[11px] text-gray-500 mt-0.5">${item.estimated_cost.toLocaleString()}</div>
                      )}
                    </td>

                    {/* CUSTOMER */}
                    <td className="px-4 py-2.5 align-top">
                      <div className="text-gray-900">{item.client_name}</div>
                      {item.client_phone && (
                        <a
                          href={`tel:${item.client_phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] text-gray-500 hover:text-primary-600"
                        >
                          {item.client_phone}
                        </a>
                      )}
                    </td>

                    {/* STAGE */}
                    <td className="px-4 py-2.5 align-top">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${meta.color}`}>
                        <StageIcon className="w-3 h-3" />
                        {meta.label}
                      </span>
                      {urgency && (
                        <div className="mt-0.5">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${urgency.className}`}>
                            <AlertCircle className="w-2.5 h-2.5" />
                            {urgency.label}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* LAST CONTACT — inline editable */}
                    <td className="px-4 py-2.5 align-top text-xs">
                      <EditableDateCell
                        value={item.last_contact_at ? item.last_contact_at.slice(0, 10) : null}
                        disabled={!dateEditable}
                        onSave={(v) => saveDate(item, 'last_contact_at', v ? new Date(v).toISOString() : null)}
                      />
                    </td>

                    {/* NEXT FOLLOW-UP — inline editable */}
                    <td className="px-4 py-2.5 align-top text-xs">
                      <EditableDateCell
                        value={item.next_follow_up ? item.next_follow_up.slice(0, 10) : null}
                        highlight={item.urgency >= 100}
                        disabled={!dateEditable}
                        onSave={(v) => saveDate(item, 'next_follow_up', v)}
                      />
                    </td>

                    {/* NOTES / BRAINSTORM — inline editable, expands to textarea */}
                    <td className="px-4 py-2.5 align-top">
                      <EditableNotesCell
                        value={item.notes}
                        onSave={(v) => saveNotes(item, v)}
                      />
                    </td>

                    {/* ACTIONS — quick icons + primary CTA */}
                    <td className="px-4 py-2.5 align-top text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-0.5">
                        <button
                          onClick={() => markContactedNow(item)}
                          disabled={item.kind === 'job' && !item.linked_quote_request_id}
                          className="p-1.5 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                          title="Mark contacted just now"
                        >
                          <Clock className="w-4 h-4" />
                        </button>

                        {item.kind === 'job' && (item.job_status === 'quoted' || item.job_status === 'estimate_revised') && (
                          <button
                            onClick={() => sendToJobs(item)}
                            className="p-1.5 rounded text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50"
                            title="Send to Jobs (deal accepted)"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}

                        {item.kind === 'quote_request' && (
                          <button
                            onClick={() => archiveLead(item)}
                            className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                            title="Archive (lost / out of pipeline)"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        )}

                        {item.kind === 'quote_request' ? (
                          <button
                            onClick={() => convertLead(item.id)}
                            disabled={convertingId === item.id}
                            className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-60"
                          >
                            {convertingId === item.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <>
                                <Sparkles className="w-3 h-3" />
                                Start
                              </>
                            )}
                          </button>
                        ) : (
                          <Link
                            href={detailHref}
                            className="ml-1 p-1.5 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50"
                            title="Open lead workspace"
                          >
                            <ArrowRight className="w-4 h-4" />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* EXPANDED HIGHLIGHT VIEW */}
                  {expanded && (
                    <tr className="bg-gray-50/60">
                      <td className="px-2 py-3"></td>
                      <td colSpan={7} className="px-4 py-3">
                        <ExpandedRowDetail item={item} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-gray-100">
          {filtered.map((item) => {
            const meta = stageMeta[item.stage]
            const StageIcon = meta.icon
            const urgency = urgencyBadge(item)
            const detailHref = `/dashboard/leads/${item.id}`
            return (
              <Link
                key={`${item.kind}-${item.id}`}
                href={detailHref}
                className="block px-4 py-3 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 truncate">{item.project_name}</div>
                    <div className="text-xs text-gray-600 mt-0.5">{item.client_name}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${meta.color}`}>
                        <StageIcon className="w-3 h-3" />
                        {meta.label}
                      </span>
                      {urgency && (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${urgency.className}`}>
                          {urgency.label}
                        </span>
                      )}
                      {item.next_follow_up && (
                        <span className="text-[10px] text-gray-400">· follow {formatDateShort(item.next_follow_up)}</span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
                </div>
              </Link>
            )
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No leads in this view.</p>
            <p className="text-sm text-gray-400 mt-1">
              Click &quot;New Lead&quot; to add one, or quote-form submissions land here automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// Inline panel surfaced when a row is expanded. Pulls everything else worth
// seeing at a glance — description, address, site visit, source, intake
// answers, scope notes excerpt — without making the user open the detail page.
function ExpandedRowDetail({ item }: { item: PipelineItem }) {
  const answerEntries = item.customer_answers
    ? Object.entries(item.customer_answers).filter(([k, v]) => v && k !== 'address' && k !== 'description' && k !== 'projectDescription')
    : []
  const hasAnyDetail =
    item.description || item.client_address || item.site_visit_at ||
    item.source || answerEntries.length > 0 || item.scope_notes_excerpt

  if (!hasAnyDetail) {
    return (
      <p className="text-xs text-gray-400 italic">
        No additional intake details. Open the lead workspace to add scope, schedule a visit, or build an estimate.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
      {/* Project description */}
      {item.description && (
        <div className="md:col-span-3">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Project description</div>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{item.description}</p>
        </div>
      )}

      {/* Scope notes (for jobs) */}
      {item.scope_notes_excerpt && (
        <div className="md:col-span-3">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Scope notes</div>
          <p className="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">{item.scope_notes_excerpt}</p>
        </div>
      )}

      {/* Address */}
      {item.client_address && (
        <div>
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <MapPin className="w-3 h-3" /> Address
          </div>
          <p className="text-sm text-gray-800">{item.client_address}</p>
        </div>
      )}

      {/* Site visit */}
      {item.site_visit_at && (
        <div>
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Estimate visit
          </div>
          <p className="text-sm text-amber-700">
            {new Date(item.site_visit_at).toLocaleString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
              hour: 'numeric', minute: '2-digit',
            })}
          </p>
          {item.site_visit_notes && <p className="text-xs text-gray-600 mt-0.5">{item.site_visit_notes}</p>}
        </div>
      )}

      {/* Source */}
      {item.source && (
        <div>
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Source</div>
          <p className="text-sm text-gray-800 capitalize">{(sourceLabels[item.source] ?? item.source)}</p>
        </div>
      )}

      {/* Intake answers (project-specific Q&A) */}
      {answerEntries.length > 0 && (
        <div className="md:col-span-3">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">From the quote form</div>
          <dl className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2">
            {answerEntries.map(([key, value]) => (
              <div key={key}>
                <dt className="text-[10px] text-gray-500 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}
                </dt>
                <dd className="text-xs text-gray-800">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Quick contact links */}
      {(item.client_phone || item.client_email) && (
        <div className="md:col-span-3 flex items-center gap-3 pt-1 border-t border-gray-200">
          {item.client_phone && (
            <a href={`tel:${item.client_phone}`} className="inline-flex items-center gap-1 text-xs text-primary-700 hover:underline">
              <Phone className="w-3 h-3" />
              {item.client_phone}
            </a>
          )}
          {item.client_email && (
            <a href={`mailto:${item.client_email}`} className="inline-flex items-center gap-1 text-xs text-primary-700 hover:underline truncate">
              <Mail className="w-3 h-3" />
              {item.client_email}
            </a>
          )}
        </div>
      )}
    </div>
  )
}
