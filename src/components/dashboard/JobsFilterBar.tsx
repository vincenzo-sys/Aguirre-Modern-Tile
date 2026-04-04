'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { useState, useEffect } from 'react'
import type { JobStatus } from '@/lib/supabase/types'

const statusTabs: { label: string; value: string; statuses: JobStatus[] }[] = [
  { label: 'All', value: 'all', statuses: [] },
  { label: 'Leads', value: 'leads', statuses: ['lead'] },
  { label: 'Quoted', value: 'quoted', statuses: ['quoted'] },
  { label: 'Scheduled', value: 'scheduled', statuses: ['scheduled'] },
  { label: 'Active', value: 'active', statuses: ['in_progress', 'waiting_for_materials'] },
  { label: 'Completed', value: 'completed', statuses: ['completed'] },
  { label: 'Paid', value: 'paid', statuses: ['paid'] },
  { label: 'Cancelled', value: 'cancelled', statuses: ['cancelled'] },
]

const jobTypes = ['Bathroom Tile', 'Shower Tile', 'Floor Tile', 'Backsplash', 'Tile Repair', 'Other']

export default function JobsFilterBar({ jobCount }: { jobCount: number }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('status') || 'all'
  const currentType = searchParams.get('type') || ''
  const currentSearch = searchParams.get('q') || ''
  const [searchInput, setSearchInput] = useState(currentSearch)

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchInput !== currentSearch) {
        updateParams({ q: searchInput || null })
      }
    }, 300)
    return () => clearTimeout(timeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    }
    router.push(`/dashboard/jobs?${params}`)
  }

  return (
    <div className="space-y-3 mb-6">
      {/* Status tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => updateParams({ status: tab.value === 'all' ? null : tab.value })}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              currentTab === tab.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search + filters row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search jobs..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <select
          value={currentType}
          onChange={(e) => updateParams({ type: e.target.value || null })}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
        >
          <option value="">All Types</option>
          {jobTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

// Helper: filter jobs based on current URL params
export function filterJobs(
  jobs: { status: string; job_type: string | null; title: string; client_name: string }[],
  statusFilter: string,
  typeFilter: string,
  searchFilter: string,
) {
  let filtered = [...jobs]

  // Status tab filter
  const tab = statusTabs.find((t) => t.value === statusFilter)
  if (tab && tab.statuses.length > 0) {
    filtered = filtered.filter((j) => tab.statuses.includes(j.status as JobStatus))
  }

  // Job type filter
  if (typeFilter) {
    filtered = filtered.filter((j) => j.job_type === typeFilter)
  }

  // Search filter
  if (searchFilter) {
    const q = searchFilter.toLowerCase()
    filtered = filtered.filter((j) =>
      j.title.toLowerCase().includes(q) ||
      j.client_name.toLowerCase().includes(q)
    )
  }

  return filtered
}
