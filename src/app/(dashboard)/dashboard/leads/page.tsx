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

      {/* Items */}
      <div className="space-y-3">
        {filtered.map((item) => {
          const meta = stageMeta[item.stage]
          const StageIcon = meta.icon
          const urgency = urgencyBadge(item)
          const detailHref = item.kind === 'quote_request'
            ? `/dashboard/leads/${item.id}`
            : `/dashboard/jobs/${item.id}`

          return (
            <Link
              key={`${item.kind}-${item.id}`}
              href={detailHref}
              className="block bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:border-primary-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{item.client_name}</h3>
                    {item.kind === 'job' && item.job_number != null && (
                      <span className="text-xs text-gray-400">#{item.job_number}</span>
                    )}
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${meta.color}`}>
                      <StageIcon className="w-3 h-3" />
                      {meta.label}
                    </span>
                    {urgency && (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${urgency.className}`}>
                        <AlertCircle className="w-3 h-3" />
                        {urgency.label}
                      </span>
                    )}
                    {item.source && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {sourceLabels[item.source] ?? item.source}
                      </span>
                    )}
                  </div>

                  {item.project_type && (
                    <p className="text-sm text-gray-600 capitalize">{item.project_type} project</p>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-500">
                    {item.client_phone && (
                      <a
                        href={`tel:${item.client_phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-primary-600"
                      >
                        {item.client_phone}
                      </a>
                    )}
                    {item.client_email && (
                      <a
                        href={`mailto:${item.client_email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-primary-600 truncate max-w-[260px]"
                      >
                        {item.client_email}
                      </a>
                    )}
                    {item.estimated_cost != null && item.estimated_cost > 0 && (
                      <span className="font-medium text-gray-700">
                        ${item.estimated_cost.toLocaleString()}
                      </span>
                    )}
                    <span>Added {formatDateShort(item.created_at)}</span>
                    {item.site_visit_at && (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <Calendar className="w-3 h-3" />
                        Visit {formatVisitDateTime(item.site_visit_at)}
                      </span>
                    )}
                    {item.next_follow_up && (
                      <span className={`inline-flex items-center gap-1 ${item.urgency >= 100 ? 'text-red-600' : 'text-gray-500'}`}>
                        <Clock className="w-3 h-3" />
                        Follow up {formatDateShort(item.next_follow_up)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions — only meaningful for quote_requests */}
                {item.kind === 'quote_request' && (
                  <div
                    className="flex items-center gap-2 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        convertLead(item.id)
                      }}
                      disabled={convertingId === item.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-60"
                      title="Convert to a job"
                    >
                      {convertingId === item.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Converting…
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Convert
                        </>
                      )}
                    </button>
                  </div>
                )}
                {item.kind === 'job' && (
                  <div className="shrink-0 flex items-center text-gray-400">
                    <ArrowRight className="w-5 h-5" />
                  </div>
                )}
              </div>
            </Link>
          )
        })}

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
