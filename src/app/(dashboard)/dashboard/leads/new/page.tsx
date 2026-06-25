'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { toast } from '@/components/Toast'
import { logError } from '@/lib/logger'

type CustomerSearchResult = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  job_count?: number
}

const projectTypes = [
  { value: 'bathroom', label: 'Bathroom' },
  { value: 'shower', label: 'Shower' },
  { value: 'kitchen-floor', label: 'Kitchen Floor' },
  { value: 'backsplash', label: 'Backsplash' },
  { value: 'other', label: 'Other' },
]

const sources = [
  { value: 'phone', label: 'Phone call' },
  { value: 'referral', label: 'Referral' },
  { value: 'walk-in', label: 'Walk-in' },
  { value: 'repeat', label: 'Repeat customer' },
  { value: 'website', label: 'Website' },
  { value: 'other', label: 'Other' },
]

export default function NewLeadPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-500">Loading...</div>}>
      <NewLeadForm />
    </Suspense>
  )
}

function NewLeadForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // When launched from a customer's page (?customer_id=...), hard-link the new
  // lead to that customer so it can't create a duplicate. The name/phone/email
  // params just prefill the visible fields.
  const [customerId, setCustomerId] = useState(searchParams.get('customer_id') || '')
  const [linkedCustomerName, setLinkedCustomerName] = useState(searchParams.get('name') || '')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerSearchResult[]>([])
  const [searchingCustomers, setSearchingCustomers] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    client_name: searchParams.get('name') || '',
    client_phone: searchParams.get('phone') || '',
    client_email: searchParams.get('email') || '',
    project_type: 'bathroom',
    source: customerId ? 'repeat' : 'phone',
    address: '',
    city: '',
    state: 'MA',
    zip: '',
    notes: '',
    next_follow_up: '',
  })

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  // Debounced search of existing customers (reuses /api/customers?q=).
  useEffect(() => {
    const q = customerSearch.trim()
    if (q.length < 2) {
      setCustomerResults([])
      return
    }
    let active = true
    setSearchingCustomers(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}`)
        if (!res.ok) throw new Error('Customer search failed')
        const data = await res.json()
        if (active) setCustomerResults(Array.isArray(data) ? data.slice(0, 8) : [])
      } catch (err) {
        logError('Customer search failed', err)
        if (active) setCustomerResults([])
      } finally {
        if (active) setSearchingCustomers(false)
      }
    }, 300)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [customerSearch])

  function selectCustomer(c: CustomerSearchResult) {
    setCustomerId(c.id)
    setLinkedCustomerName(c.name)
    setForm((prev) => ({
      ...prev,
      client_name: c.name || prev.client_name,
      client_phone: c.phone || prev.client_phone,
      client_email: c.email || prev.client_email,
      address: c.address || prev.address,
      city: c.city || prev.city,
      state: c.state || prev.state,
      zip: c.zip || prev.zip,
      source: 'repeat',
    }))
    setCustomerSearch('')
    setCustomerResults([])
    toast(`Linked to ${c.name}`)
  }

  function clearLinkedCustomer() {
    setCustomerId('')
    setLinkedCustomerName('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.client_name.trim()) {
      toast('Lead name is required', 'error')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customerId ? { ...form, customer_id: customerId } : form),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create lead')
      }

      const lead = await res.json()
      toast('Lead created', 'success')
      router.push(`/dashboard/leads/${lead.id}`)
    } catch (err) {
      logError('Create lead failed', err)
      toast(err instanceof Error ? err.message : 'Failed to create lead', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <Link
        href="/dashboard/leads"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Leads
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Lead</h1>

      {customerId ? (
        <div className="mb-4 rounded-lg bg-primary-50 border border-primary-200 p-3 flex items-center justify-between gap-3">
          <p className="text-sm text-primary-800">
            Linked to existing customer:{' '}
            <span className="font-semibold">{linkedCustomerName || 'Selected customer'}</span>
            {' '}— this lead attaches to their record and won&apos;t create a duplicate.
          </p>
          <button
            type="button"
            onClick={clearLinkedCustomer}
            className="shrink-0 text-sm font-medium text-primary-700 hover:text-primary-900"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="mb-4 rounded-lg bg-gray-50 border border-gray-200 p-3 relative">
          <label htmlFor="customer_search" className="block text-sm font-medium text-gray-700 mb-1">
            Previous customer? <span className="font-normal text-gray-500">(optional — pull up an existing record to price)</span>
          </label>
          <input
            id="customer_search"
            type="text"
            autoComplete="off"
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="Search by name, phone, or email…"
          />
          <p className="mt-1 text-xs text-gray-500">
            Leave blank to enter a brand-new lead below.
          </p>
          {(searchingCustomers || customerResults.length > 0) && customerSearch.trim().length >= 2 && (
            <ul className="absolute z-10 left-3 right-3 mt-1 max-h-64 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
              {searchingCustomers && customerResults.length === 0 && (
                <li className="px-3 py-2 text-sm text-gray-500">Searching…</li>
              )}
              {!searchingCustomers && customerResults.length === 0 && (
                <li className="px-3 py-2 text-sm text-gray-500">No matching customers.</li>
              )}
              {customerResults.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => selectCustomer(c)}
                    className="w-full text-left px-3 py-2 hover:bg-primary-50 focus:bg-primary-50 focus:outline-none"
                  >
                    <span className="block text-sm font-medium text-gray-900">{c.name}</span>
                    <span className="block text-xs text-gray-500">
                      {[c.phone, c.email].filter(Boolean).join(' · ') || 'No contact info'}
                      {c.job_count ? ` · ${c.job_count} prior job${c.job_count === 1 ? '' : 's'}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-lg border border-gray-200 p-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={form.client_name}
            onChange={(e) => updateField('client_name', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="Full name"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              value={form.client_phone}
              onChange={(e) => updateField('client_phone', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="(617) 555-0123"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={form.client_email}
              onChange={(e) => updateField('client_email', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="email@example.com"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Type</label>
            <select
              value={form.project_type}
              onChange={(e) => updateField('project_type', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              {projectTypes.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <select
              value={form.source}
              onChange={(e) => updateField('source', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              {sources.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => updateField('address', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="Job site / street address"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input
              type="text"
              value={form.city}
              onChange={(e) => updateField('city', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Boston"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
            <input
              type="text"
              value={form.state}
              onChange={(e) => updateField('state', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="MA"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
            <input
              type="text"
              value={form.zip}
              onChange={(e) => updateField('zip', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="02108"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Next follow-up</label>
          <input
            type="date"
            value={form.next_follow_up}
            onChange={(e) => updateField('next_follow_up', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
            placeholder="What did they say? Budget, timeline, tile preferences..."
          />
        </div>

        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Create Lead'}
          </button>
          <Link
            href="/dashboard/leads"
            className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
