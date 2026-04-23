'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Inbox, ArrowRight, AlertCircle, Sparkles, Loader2, Plus, Clock,
  Calendar, FileText, FilePlus, FileCheck,
} from 'lucide-react'
import { toast } from '@/components/Toast'

// Mirrors PipelineItem in /api/pipeline/route.ts.
type PipelineStage =
  | 'new' | 'reviewed' | 'visit_scheduled'
  | 'lead_in_progress' | 'estimate_sent' | 'estimate_revised'

type PipelineItem = {
  kind: 'quote_request' | 'job'
  id: string
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
  project_type?: string
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
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2.5">Customer</th>
                <th className="text-left px-4 py-2.5">Stage</th>
                <th className="text-left px-4 py-2.5">Project</th>
                <th className="text-left px-4 py-2.5">Last contact</th>
                <th className="text-left px-4 py-2.5">Next follow-up</th>
                <th className="text-right px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((item) => {
                const meta = stageMeta[item.stage]
                const StageIcon = meta.icon
                const urgency = urgencyBadge(item)
                // Both quote_requests and lead-stage jobs land in the leads
                // workspace — that's the whole point of the redesign.
                const detailHref = `/dashboard/leads/${item.id}`
                return (
                  <tr
                    key={`${item.kind}-${item.id}`}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(detailHref)}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-gray-900 flex items-center gap-2">
                        {item.client_name}
                        {item.kind === 'job' && item.job_number != null && (
                          <span className="text-[11px] text-gray-400">#{item.job_number}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                        {item.client_phone && (
                          <a
                            href={`tel:${item.client_phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-primary-600"
                          >
                            {item.client_phone}
                          </a>
                        )}
                        {item.source && (
                          <span className="text-gray-400">· {sourceLabels[item.source] ?? item.source}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${meta.color}`}>
                        <StageIcon className="w-3 h-3" />
                        {meta.label}
                      </span>
                      {urgency && (
                        <div className="mt-1">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${urgency.className}`}>
                            <AlertCircle className="w-2.5 h-2.5" />
                            {urgency.label}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-gray-700">
                      <div className="capitalize">{item.project_type ?? '—'}</div>
                      {item.estimated_cost != null && item.estimated_cost > 0 && (
                        <div className="text-xs text-gray-500 mt-0.5">${item.estimated_cost.toLocaleString()}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-gray-600">
                      {formatDateShort(item.last_contact_at) ?? <span className="text-gray-300">never</span>}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {item.next_follow_up ? (
                        <span className={item.urgency >= 100 ? 'text-red-600 font-medium' : 'text-gray-600'}>
                          {formatDateShort(item.next_follow_up)}
                        </span>
                      ) : item.site_visit_at ? (
                        <span className="text-amber-700 inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Visit {formatDateShort(item.site_visit_at)}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td
                      className="px-4 py-3 align-top text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.kind === 'quote_request' ? (
                        <button
                          onClick={() => convertLead(item.id)}
                          disabled={convertingId === item.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-60"
                        >
                          {convertingId === item.id ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Working…
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3" />
                              Start working
                            </>
                          )}
                        </button>
                      ) : (
                        <ArrowRight className="w-4 h-4 text-gray-300 inline" />
                      )}
                    </td>
                  </tr>
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
                    <div className="font-medium text-gray-900 truncate">{item.client_name}</div>
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
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {item.project_type && <span className="capitalize">{item.project_type}</span>}
                      {item.next_follow_up && <span className="ml-2">· Follow {formatDateShort(item.next_follow_up)}</span>}
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
