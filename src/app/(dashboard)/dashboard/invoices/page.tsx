'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import InvoiceStatusBadge from '@/components/dashboard/InvoiceStatusBadge'
import { getAllDemoInvoices } from '@/lib/demo'
import type { InvoiceStatus, InvoiceWithJob } from '@/lib/supabase/types'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const tabs: { label: string; value: InvoiceStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Sent', value: 'sent' },
  { label: 'Paid', value: 'paid' },
  { label: 'Overdue', value: 'overdue' },
]

export default function InvoicesPage() {
  const [activeTab, setActiveTab] = useState<InvoiceStatus | 'all'>('all')
  const allInvoices = getAllDemoInvoices()
  const filtered = activeTab === 'all' ? allInvoices : allInvoices.filter((inv) => inv.status === activeTab)

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

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
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
              <tr key={inv.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <Link href={`/dashboard/invoices/${inv.id}`} className="text-sm font-mono text-primary-600 hover:text-primary-700">
                    {inv.invoice_number}
                  </Link>
                </td>
                <td className="px-6 py-4">
                  {inv.job ? (
                    <Link href={`/dashboard/jobs/${inv.job.id}`} className="text-sm text-gray-900 hover:text-primary-600">
                      #{inv.job.job_number} {inv.job.title}
                    </Link>
                  ) : (
                    <span className="text-sm text-gray-400">—</span>
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
