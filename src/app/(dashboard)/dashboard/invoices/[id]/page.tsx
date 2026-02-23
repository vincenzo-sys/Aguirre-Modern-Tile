'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import InvoiceStatusBadge from '@/components/dashboard/InvoiceStatusBadge'
import { toast } from '@/components/Toast'
import { getDemoInvoice } from '@/lib/demo'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const invoice = getDemoInvoice(params.id as string)

  if (!invoice) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Invoice not found.</p>
        <Link href="/dashboard/invoices" className="text-primary-600 hover:text-primary-700 text-sm mt-2 inline-block">
          Back to invoices
        </Link>
      </div>
    )
  }

  function handleMarkAs(newStatus: string) {
    toast(`Demo mode: Invoice would be marked as "${newStatus}". Connect Supabase to update real data.`)
  }

  return (
    <div className="max-w-3xl">
      <Link
        href="/dashboard/invoices"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to invoices
      </Link>

      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{invoice.invoice_number}</h1>
            {invoice.job && (
              <Link
                href={`/dashboard/jobs/${invoice.job.id}`}
                className="text-sm text-primary-600 hover:text-primary-700 mt-1 inline-block"
              >
                #{invoice.job.job_number} {invoice.job.title}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3">
            <InvoiceStatusBadge status={invoice.status} />
            {invoice.status === 'draft' && (
              <button
                onClick={() => handleMarkAs('sent')}
                className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Mark as Sent
              </button>
            )}
            {invoice.status === 'sent' && (
              <button
                onClick={() => handleMarkAs('paid')}
                className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
              >
                Mark as Paid
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Amount</p>
            <p className="font-bold text-gray-900 text-lg">{fmt.format(invoice.amount)}</p>
          </div>
          <div>
            <p className="text-gray-500">Due Date</p>
            <p className="font-medium text-gray-900">
              {new Date(invoice.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          {invoice.job && (
            <div>
              <p className="text-gray-500">Client</p>
              <p className="font-medium text-gray-900">{invoice.job.client_name}</p>
            </div>
          )}
        </div>
      </div>

      {/* Line Items */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Qty</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Unit Price</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {invoice.line_items.map((item, i) => (
              <tr key={i}>
                <td className="px-6 py-3 text-sm text-gray-900">{item.description}</td>
                <td className="px-6 py-3 text-sm text-gray-600 text-right">{item.quantity}</td>
                <td className="px-6 py-3 text-sm text-gray-600 text-right">{fmt.format(item.unit_price)}</td>
                <td className="px-6 py-3 text-sm font-medium text-gray-900 text-right">{fmt.format(item.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td colSpan={3} className="px-6 py-3 text-sm font-semibold text-gray-900 text-right">Total</td>
              <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right">{fmt.format(invoice.amount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Meta */}
      <div className="mt-6 text-xs text-gray-400 space-y-1">
        <p>Created {new Date(invoice.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
        <p>Updated {new Date(invoice.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
      </div>
    </div>
  )
}
