'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Inbox, ArrowRight, Eye, Archive, CheckCircle } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { QuoteRequest, QuoteRequestStatus } from '@/lib/supabase/types'

const statusColors: Record<QuoteRequestStatus, string> = {
  new: 'bg-blue-100 text-blue-700',
  reviewed: 'bg-yellow-100 text-yellow-700',
  converted: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-500',
}

const tabs: { label: string; value: QuoteRequestStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'New', value: 'new' },
  { label: 'Reviewed', value: 'reviewed' },
  { label: 'Converted', value: 'converted' },
  { label: 'Archived', value: 'archived' },
]

const isDemoMode = !process.env.NEXT_PUBLIC_SUPABASE_URL

export default function LeadsPage() {
  const [leads, setLeads] = useState<QuoteRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<QuoteRequestStatus | 'all'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

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

  const filtered = activeTab === 'all' ? leads : leads.filter((l) => l.status === activeTab)
  const newCount = leads.filter((l) => l.status === 'new').length

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">Loading leads...</div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500 mt-1">
            {leads.length} total{newCount > 0 && ` · ${newCount} new`}
          </p>
        </div>
      </div>

      {isDemoMode && (
        <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 p-3">
          <p className="text-sm text-amber-800">
            <strong>Demo Mode</strong> — Viewing sample data. Quote form submissions will appear here when Supabase is connected.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Lead cards */}
      <div className="space-y-3">
        {filtered.map((lead) => (
          <div
            key={lead.id}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-semibold text-gray-900">{lead.client_name}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[lead.status]}`}>
                    {lead.status}
                  </span>
                </div>
                <p className="text-sm text-gray-600 capitalize">{lead.project_type} project</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-500">
                  <a href={`tel:${lead.client_phone}`} className="hover:text-primary-600">{lead.client_phone}</a>
                  <a href={`mailto:${lead.client_email}`} className="hover:text-primary-600">{lead.client_email}</a>
                  <span>{new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
                  title="View details"
                >
                  <Eye className="w-4 h-4" />
                </button>
                {lead.status === 'new' && (
                  <button
                    onClick={() => updateStatus(lead.id, 'reviewed')}
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
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
                      title="Convert to job"
                    >
                      <ArrowRight className="w-4 h-4" />
                      Convert to Job
                    </Link>
                    <button
                      onClick={() => updateStatus(lead.id, 'archived')}
                      className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
                      title="Archive"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Expanded details */}
            {expandedId === lead.id && Object.keys(lead.answers).length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Project Details</h4>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  {Object.entries(lead.answers)
                    .filter(([, v]) => v)
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt className="text-xs text-gray-500 capitalize">{key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}</dt>
                        <dd className="text-sm text-gray-900">{value}</dd>
                      </div>
                    ))}
                </dl>
              </div>
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No leads found.</p>
            <p className="text-sm text-gray-400 mt-1">Quote form submissions from the website will appear here.</p>
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
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
]
