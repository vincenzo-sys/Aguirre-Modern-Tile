import Link from 'next/link'
import { FileText, Plus } from 'lucide-react'
import InvoiceStatusBadge from './InvoiceStatusBadge'
import type { Invoice } from '@/lib/supabase/types'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

interface JobInvoiceListProps {
  invoices: Invoice[]
  jobId: string
  isOwner: boolean
}

export default function JobInvoiceList({ invoices, jobId, isOwner }: JobInvoiceListProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Invoices ({invoices.length})
        </h2>
        {isOwner && (
          <Link
            href={`/dashboard/invoices/new?job=${jobId}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            <Plus className="w-4 h-4" />
            Create Invoice
          </Link>
        )}
      </div>

      {invoices.length === 0 ? (
        <p className="text-sm text-gray-500">No invoices yet.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {invoices.map((inv) => (
            <Link
              key={inv.id}
              href={`/dashboard/invoices/${inv.id}`}
              className="flex items-center justify-between py-3 hover:bg-gray-50 -mx-2 px-2 rounded transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono text-gray-600">{inv.invoice_number}</span>
                <InvoiceStatusBadge status={inv.status} />
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{fmt.format(inv.amount)}</p>
                <p className="text-xs text-gray-400">
                  Due {new Date(inv.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
