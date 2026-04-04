'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Search, Plus, Phone, Mail, Users } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { CustomerWithStats, CustomerSource } from '@/lib/supabase/types'

const isDemoMode = !process.env.NEXT_PUBLIC_SUPABASE_URL

const sourceColors: Record<CustomerSource, string> = {
  website: 'bg-blue-100 text-blue-700',
  manual: 'bg-gray-100 text-gray-600',
  referral: 'bg-green-100 text-green-700',
  repeat: 'bg-purple-100 text-purple-700',
}

const sourceTabs: { label: string; value: CustomerSource | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Website', value: 'website' },
  { label: 'Manual', value: 'manual' },
  { label: 'Referral', value: 'referral' },
]

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount)
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<CustomerSource | 'all'>('all')

  const loadCustomers = useCallback(async () => {
    if (isDemoMode) {
      const { demoCustomersWithStats } = await import('@/lib/demo')
      setCustomers(demoCustomersWithStats)
      setLoading(false)
      return
    }

    try {
      const params = new URLSearchParams()
      if (search) params.set('q', search)
      if (sourceFilter !== 'all') params.set('source', sourceFilter)

      const res = await fetch(`/api/customers?${params}`)
      if (!res.ok) throw new Error('Failed to load customers')
      const data = await res.json()
      setCustomers(data)
    } catch (err) {
      console.error(err)
      toast('Failed to load customers', 'error')
    } finally {
      setLoading(false)
    }
  }, [search, sourceFilter])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  // Debounced search
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(timeout)
  }, [searchInput])

  const filtered = sourceFilter === 'all'
    ? customers
    : customers.filter((c) => c.source === sourceFilter)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 mt-1">
            {customers.length} total customer{customers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/dashboard/customers/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Customer
        </Link>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {sourceTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setSourceFilter(tab.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                sourceFilter === tab.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading customers...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No customers found</p>
          {search && (
            <p className="text-sm text-gray-400 mt-1">Try adjusting your search</p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">
                    Customer
                  </th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">
                    Email
                  </th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                    Phone
                  </th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">
                    Source
                  </th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                    Jobs
                  </th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((customer) => (
                  <tr
                    key={customer.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/customers/${customer.id}`} className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-semibold shrink-0">
                          {getInitials(customer.name)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{customer.name}</p>
                          <p className="text-xs text-gray-400 sm:hidden">{customer.email ?? customer.phone ?? '—'}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {customer.email ? (
                        <a href={`mailto:${customer.email}`} className="text-sm text-gray-600 hover:text-primary-600 inline-flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5" />
                          {customer.email}
                        </a>
                      ) : (
                        <span className="text-sm text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {customer.phone ? (
                        <a href={`tel:${customer.phone}`} className="text-sm text-gray-600 hover:text-primary-600 inline-flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" />
                          {customer.phone}
                        </a>
                      ) : (
                        <span className="text-sm text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${sourceColors[customer.source]}`}>
                        {customer.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">
                      <span className="text-sm text-gray-700 font-medium">{customer.job_count}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-gray-900">
                        {formatCurrency(customer.total_revenue)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
