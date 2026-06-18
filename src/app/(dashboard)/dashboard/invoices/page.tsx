'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import InvoiceStatusBadge from '@/components/dashboard/InvoiceStatusBadge'
import { SkeletonCards } from '@/components/ui/Skeleton'
import { logError } from '@/lib/logger'
import { getAllDemoInvoices } from '@/lib/demo'
import type { InvoiceStatus, InvoiceWithJob } from '@/lib/supabase/types'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
const tabs: { label: string; value: InvoiceStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Sent', value: 'sent' },
  { label: 'Paid', value: 'paid' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Void', value: 'void' },
]

const isDemoMode = !process.env.NEXT_PUBLIC_SUPABASE_URL

export default function InvoicesPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<InvoiceStatus | 'all'>('all')
  const [allInvoices, setAllInvoices] = useState<InvoiceWithJob[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isDemoMode) {
      setAllInvoices(getAllDemoInvoices())
      setLoading(false)
      return
    }

    async function loadInvoices() {
      try {
        const res = await fetch('/api/invoices')
        if (res.ok) {
          const data = await res.json()
          setAllInvoices(data)
        }
      } catch (err) {
        logError('Failed to load invoices:', err)
      }
      setLoading(false)
    }

    loadInvoices()
  }, [])

  const filtered = activeTab === 'all' ? allInvoices : allInvoices.filter((inv) => inv.status === activeTab)

  if (loading) {
    return (
      <div className="pt-6">
        <SkeletonCards count={6} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">{allInvoices.length} total</p>
        </div>
        <Link
          href="/dashboard/invoices/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Invoice
        </Link>
      </div>

      {isDemoMode && (
        <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 p-3">
          <p className="text-sm text-amber-800">
            <strong>Demo Mode</strong> — Viewing sample data.
          </p>
        </div>
      )}

      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-full sm:w-fit overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`min-h-[44px] px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === tab.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mobile: stacked cards (a desktop table is unreadable on a phone). */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-8">No invoices found.</p>
        ) : (
          filtered.map((inv) => (
            <Link
              key={inv.id}
              href={`/dashboard/invoices/${inv.id}`}
              className="block bg-white rounded-xl border border-gray-200 shadow-sm p-4 active:bg-gray-50"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-mono text-primary-600">{inv.invoice_number}</span>
                <InvoiceStatusBadge status={inv.status} />
              </div>
              <p className="text-sm text-gray-900 mt-1 truncate">
                {inv.job ? `#${inv.job.job_number} ${inv.job.title}` : '—'}
              </p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-base font-semibold text-gray-900">{fmt.format(inv.amount)}</span>
                <span className="text-xs text-gray-500">Due {fmtDate(inv.due_date)}</span>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Desktop: full table. */}
      <div className="hidden md:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Invoice #</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Job</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Due Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((inv) => (
              <tr
                key={inv.id}
                onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}
                className="hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-6 py-4">
                  <span className="text-sm font-mono text-primary-600">
                    {inv.invoice_number}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {inv.job ? (
                    <span className="text-sm text-gray-900">
                      #{inv.job.job_number} {inv.job.title}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">&mdash;</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm font-semibold text-gray-900">{fmt.format(inv.amount)}</td>
                <td className="px-6 py-4">
                  <InvoiceStatusBadge status={inv.status} />
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(inv.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                  No invoices found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
