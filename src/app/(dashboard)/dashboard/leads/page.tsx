'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Inbox, ArrowRight, Archive, CheckCircle, Plus, Clock, AlertCircle } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { QuoteRequest, QuoteRequestStatus } from '@/lib/supabase/types'

type LeadTab = 'active' | 'archive'

const statusColors: Record<QuoteRequestStatus, string> = {
  new: 'bg-blue-100 text-blue-700',
  reviewed: 'bg-yellow-100 text-yellow-700',
  converted: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-500',
}

const sourceLabels: Record<string, string> = {
  website: 'Website',
  phone: 'Phone',
  referral: 'Referral',
  'walk-in': 'Walk-in',
  repeat: 'Repeat',
  other: 'Other',
}

const isDemoMode = !process.env.NEXT_PUBLIC_SUPABASE_URL

function isFollowUpDue(lead: QuoteRequest): boolean {
  if (!lead.next_follow_up) return false
  if (lead.status === 'converted' || lead.status === 'archived') return false
  const today = new Date().toISOString().slice(0, 10)
  return lead.next_follow_up <= today
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<QuoteRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<LeadTab>('active')
  const [sourceFilter, setSourceFilter] = useState<string>('all')

  useEffect(() => {
    if (isDemoMode) {
      setLeads(demoLeads)
      setLoading(false)
      return
    }

    async function loadLeads() {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data, error } = await supabase
        .from('quote_requests')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to load leads:', error.message)
        toast('Failed to load leads', 'error')
      }

      setLeads((data ?? []) as QuoteRequest[])
      setLoading(false)
    }

    loadLeads()
  }, [])

  async function updateStatus(id: string, newStatus: QuoteRequestStatus) {
    if (isDemoMode) {
      toast(`Demo mode: Lead would be marked as "${newStatus}".`)
      return
    }

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    const { error } = await supabase
      .from('quote_requests')
      .update({ status: newStatus })
      .eq('id', id)

    if (error) {
      toast('Failed to update status', 'error')
      return
    }

    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l))
    )
    toast(`Lead marked as ${newStatus}`)
  }

  const followUpCount = leads.filter(isFollowUpDue).length
  const newCount = leads.filter((l) => l.status === 'new').length

  const availableSources = useMemo(() => {
    const set = new Set<string>()
    for (const l of leads) {
      if (l.source) set.add(l.source)
    }
    return Array.from(set).sort()
  }, [leads])

  const activeCount = leads.filter((l) => l.status === 'new' || l.status === 'reviewed').length
  const archiveCount = leads.length - activeCount

  const tabs: { label: string; value: LeadTab; count?: number }[] = [
    { label: 'Active', value: 'active', count: activeCount },
    { label: 'Archive', value: 'archive', count: archiveCount },
  ]

  const filtered = leads
    .filter((l) => {
      const isActiveRow = l.status === 'new' || l.status === 'reviewed'
      if (activeTab === 'active' && !isActiveRow) return false
      if (activeTab === 'archive' && isActiveRow) return false
      if (sourceFilter !== 'all' && (l.source ?? 'website') !== sourceFilter) return false
      return true
    })
    .sort((a, b) => {
      if (activeTab !== 'active') return b.created_at.localeCompare(a.created_at)
      const aDue = isFollowUpDue(a) ? 0 : 1
      const bDue = isFollowUpDue(b) ? 0 : 1
      if (aDue !== bDue) return aDue - bDue
      const aFollow = a.next_follow_up ?? '9999-12-31'
      const bFollow = b.next_follow_up ?? '9999-12-31'
      if (aFollow !== bFollow) return aFollow.localeCompare(bFollow)
      return b.created_at.localeCompare(a.created_at)
    })

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading leads...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500 mt-1">
            {leads.length} total{newCount > 0 && ` · ${newCount} new`}
            {followUpCount > 0 && ` · ${followUpCount} need follow-up`}
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

      {isDemoMode && (
        <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 p-3">
          <p className="text-sm text-amber-800">
            <strong>Demo Mode</strong> — Viewing sample data. Quote form submissions will appear here when Supabase is connected.
          </p>
        </div>
      )}

      {/* Tabs + source filter */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-xs rounded-full bg-gray-200 text-gray-700">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {availableSources.length > 0 && (
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
          >
            <option value="all">All sources</option>
            {availableSources.map((s) => (
              <option key={s} value={s}>
                {sourceLabels[s] ?? s}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Lead cards */}
      <div className="space-y-3">
        {filtered.map((lead) => {
          const overdue = isFollowUpDue(lead)
          return (
            <Link
              key={lead.id}
              href={`/dashboard/leads/${lead.id}`}
              className="block bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:border-primary-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{lead.client_name}</h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[lead.status]}`}>
                      {lead.status}
                    </span>
                    {lead.source && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {sourceLabels[lead.source] ?? lead.source}
                      </span>
                    )}
                    {overdue && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                        <AlertCircle className="w-3 h-3" />
                        Follow-up due
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 capitalize">{lead.project_type} project</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-500">
                    {lead.client_phone && (
                      <a
                        href={`tel:${lead.client_phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-primary-600"
                      >
                        {lead.client_phone}
                      </a>
                    )}
                    {lead.client_email && (
                      <a
                        href={`mailto:${lead.client_email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-primary-600"
                      >
                        {lead.client_email}
                      </a>
                    )}
                    <span>
                      {new Date(lead.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    {lead.next_follow_up && (
                      <span className={`inline-flex items-center gap-1 ${overdue ? 'text-red-600' : 'text-gray-500'}`}>
                        <Clock className="w-3 h-3" />
                        Follow up {new Date(lead.next_follow_up).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                <div
                  className="flex items-center gap-2 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {lead.status === 'new' && (
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        updateStatus(lead.id, 'reviewed')
                      }}
                      className="p-2 text-gray-400 hover:text-yellow-600 rounded-md hover:bg-yellow-50"
                      title="Mark reviewed"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  )}
                  {(lead.status === 'new' || lead.status === 'reviewed') && (
                    <>
                      <Link
                        href={`/dashboard/jobs/new?from_lead=${lead.id}&name=${encodeURIComponent(lead.client_name)}&phone=${encodeURIComponent(lead.client_phone)}&email=${encodeURIComponent(lead.client_email)}&type=${encodeURIComponent(lead.project_type)}&notes=${encodeURIComponent(formatAnswers(lead.answers))}${lead.customer_id ? `&customer_id=${lead.customer_id}` : ''}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
                        title="Convert to job"
                      >
                        <ArrowRight className="w-4 h-4" />
                        Convert
                      </Link>
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          updateStatus(lead.id, 'archived')
                        }}
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
                        title="Archive"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Link>
          )
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No leads found.</p>
            <p className="text-sm text-gray-400 mt-1">Click "New Lead" to add one manually, or quote form submissions will land here.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function formatAnswers(answers: Record<string, string>): string {
  return Object.entries(answers)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
}

// Demo data for preview
const demoLeads: QuoteRequest[] = [
  {
    id: 'demo-lead-1',
    status: 'new',
    customer_id: null,
    client_name: 'Sarah Johnson',
    client_email: 'sarah@example.com',
    client_phone: '(617) 555-0142',
    project_type: 'bathroom',
    answers: {
      bathroomSize: 'medium',
      tileType: 'ceramic',
      includesFloor: 'yes',
      timeline: 'within-month',
      additionalNotes: 'Want a modern look with subway tiles. Budget around $5,000.',
    },
    converted_job_id: null,
    source: 'website',
    last_contact_at: null,
    next_follow_up: null,
    lost_reason: null,
    notes: null,
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-lead-2',
    status: 'reviewed',
    customer_id: null,
    client_name: 'Michael Torres',
    client_email: 'mtorres@example.com',
    client_phone: '(781) 555-0298',
    project_type: 'shower',
    answers: {
      showerType: 'walk-in',
      waterproofing: 'needed',
      tilePreference: 'porcelain',
      additionalNotes: 'Replacing old fiberglass insert with custom tile.',
    },
    converted_job_id: null,
    source: 'phone',
    last_contact_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    next_follow_up: new Date().toISOString().slice(0, 10),
    lost_reason: null,
    notes: 'Called Tuesday, wants quote by Friday.',
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'demo-lead-3',
    status: 'converted',
    customer_id: null,
    client_name: 'Lisa Chen',
    client_email: 'lchen@example.com',
    client_phone: '(617) 555-0376',
    project_type: 'kitchen-floor',
    answers: {
      floorArea: '200-sqft',
      currentFloor: 'vinyl',
      tileType: 'porcelain',
    },
    converted_job_id: 'demo-job-4',
    source: 'referral',
    last_contact_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    next_follow_up: null,
    lost_reason: null,
    notes: null,
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
]
