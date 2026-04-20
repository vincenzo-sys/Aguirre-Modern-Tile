'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Phone, Mail, User, Calendar, Tag, Save, Archive, CheckCircle, MapPin } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { QuoteRequest, QuoteRequestStatus } from '@/lib/supabase/types'

const statusColors: Record<QuoteRequestStatus, string> = {
  new: 'bg-blue-100 text-blue-700',
  reviewed: 'bg-yellow-100 text-yellow-700',
  converted: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-500',
}

const sources = [
  { value: 'website', label: 'Website' },
  { value: 'phone', label: 'Phone call' },
  { value: 'referral', label: 'Referral' },
  { value: 'walk-in', label: 'Walk-in' },
  { value: 'repeat', label: 'Repeat customer' },
  { value: 'other', label: 'Other' },
]

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [lead, setLead] = useState<QuoteRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState('')
  const [nextFollowUp, setNextFollowUp] = useState('')
  const [source, setSource] = useState<string>('website')
  const [lostReason, setLostReason] = useState('')
  const [siteVisitAt, setSiteVisitAt] = useState('')
  const [siteVisitNotes, setSiteVisitNotes] = useState('')

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/leads/${id}`)
      if (!res.ok) {
        toast('Failed to load lead', 'error')
        setLoading(false)
        return
      }
      const data = (await res.json()) as QuoteRequest
      setLead(data)
      setNotes(data.notes ?? '')
      setNextFollowUp(data.next_follow_up ?? '')
      setSource(data.source ?? 'website')
      setLostReason(data.lost_reason ?? '')
      setSiteVisitAt(
        data.site_visit_at ? new Date(data.site_visit_at).toISOString().slice(0, 16) : ''
      )
      setSiteVisitNotes(data.site_visit_notes ?? '')
      setLoading(false)
    }
    load()
  }, [id])

  async function patch(updates: Record<string, unknown>) {
    const res = await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      toast('Update failed', 'error')
      return null
    }
    const data = (await res.json()) as QuoteRequest
    setLead(data)
    return data
  }

  async function saveCrmFields() {
    setSaving(true)
    await patch({
      notes,
      next_follow_up: nextFollowUp || null,
      source,
      lost_reason: lostReason || null,
      last_contact_at: new Date().toISOString(),
      site_visit_at: siteVisitAt ? new Date(siteVisitAt).toISOString() : null,
      site_visit_notes: siteVisitNotes || null,
    })
    setSaving(false)
    toast('Saved', 'success')
  }

  async function updateStatus(newStatus: QuoteRequestStatus) {
    await patch({ status: newStatus })
    toast(`Marked as ${newStatus}`)
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading lead...</div>
  }

  if (!lead) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Lead not found.</p>
        <Link href="/dashboard/leads" className="text-primary-600 hover:underline text-sm">
          ← Back to Leads
        </Link>
      </div>
    )
  }

  const answerEntries = Object.entries(lead.answers).filter(([, v]) => v)

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/leads"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Leads
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">{lead.client_name}</h1>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[lead.status]}`}>
              {lead.status}
            </span>
          </div>
          <p className="text-sm text-gray-500 capitalize">
            {lead.project_type} project · Created {new Date(lead.created_at).toLocaleDateString()}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {lead.status === 'new' && (
            <button
              onClick={() => updateStatus('reviewed')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-yellow-700 bg-yellow-50 rounded-md hover:bg-yellow-100"
            >
              <CheckCircle className="w-4 h-4" />
              Mark reviewed
            </button>
          )}
          {(lead.status === 'new' || lead.status === 'reviewed') && (
            <>
              <Link
                href={`/dashboard/jobs/new?from_lead=${lead.id}&name=${encodeURIComponent(lead.client_name)}&phone=${encodeURIComponent(lead.client_phone)}&email=${encodeURIComponent(lead.client_email)}&type=${encodeURIComponent(lead.project_type)}${lead.customer_id ? `&customer_id=${lead.customer_id}` : ''}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
              >
                <ArrowRight className="w-4 h-4" />
                Convert to Job
              </Link>
              <button
                onClick={() => updateStatus('archived')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                <Archive className="w-4 h-4" />
                Archive
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: contact + project details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Contact</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-gray-900">{lead.client_name}</span>
              </div>
              {lead.client_phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <a href={`tel:${lead.client_phone}`} className="text-primary-600 hover:underline">
                    {lead.client_phone}
                  </a>
                </div>
              )}
              {lead.client_email && (
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <a href={`mailto:${lead.client_email}`} className="text-primary-600 hover:underline">
                    {lead.client_email}
                  </a>
                </div>
              )}
              {lead.customer_id && (
                <div className="pt-2">
                  <Link
                    href={`/dashboard/customers/${lead.customer_id}`}
                    className="text-sm text-primary-600 hover:underline"
                  >
                    View customer history →
                  </Link>
                </div>
              )}
            </dl>
          </div>

          {/* Project details */}
          {answerEntries.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Project Details</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {answerEntries.map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs text-gray-500 capitalize">
                      {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}
                    </dt>
                    <dd className="text-sm text-gray-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* In-person estimate visit */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-400" />
              In-person estimate visit
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Date &amp; time</label>
                <input
                  type="datetime-local"
                  value={siteVisitAt}
                  onChange={(e) => setSiteVisitAt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Visit notes</label>
                <input
                  type="text"
                  value={siteVisitNotes}
                  onChange={(e) => setSiteVisitNotes(e.target.value)}
                  placeholder="Gate code, parking, what to bring..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Save on the right → visit appears on your Home page and the leads list.
            </p>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Notes</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder="Call notes, budget, timeline, tile preferences..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        {/* Right column: CRM fields */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Sales tracking</h2>

            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                  <Tag className="w-3 h-3" /> Source
                </label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {sources.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                  <Calendar className="w-3 h-3" /> Next follow-up
                </label>
                <input
                  type="date"
                  value={nextFollowUp}
                  onChange={(e) => setNextFollowUp(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Last contact</label>
                <p className="text-sm text-gray-900">
                  {lead.last_contact_at
                    ? new Date(lead.last_contact_at).toLocaleString()
                    : 'Never recorded'}
                </p>
              </div>

              {lead.status === 'archived' && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Lost reason</label>
                  <input
                    type="text"
                    value={lostReason}
                    onChange={(e) => setLostReason(e.target.value)}
                    placeholder="Price, timeline, scope mismatch..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              )}
            </div>
          </div>

          <button
            onClick={saveCrmFields}
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save changes'}
          </button>

          {lead.converted_job_id && (
            <Link
              href={`/dashboard/jobs/${lead.converted_job_id}`}
              className="block text-center text-sm text-primary-600 hover:underline"
            >
              View converted job →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
