import Link from 'next/link'
import { FileText, Receipt } from 'lucide-react'
import type { Job, Invoice } from '@/lib/supabase/types'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount)
}

const invoiceStatusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-600',
  void: 'bg-gray-100 text-gray-400',
}

export default function EstimateInvoiceCards({
  job,
  invoices,
}: {
  job: Job
  invoices: Invoice[]
}) {
  const hasEstimate = (job.estimated_cost ?? 0) > 0 || job.line_items.length > 0
  const lineItemsTotal = job.line_items.reduce((sum, item) => sum + item.amount, 0)
  const estimateAmount = lineItemsTotal > 0 ? lineItemsTotal : (job.estimated_cost ?? 0)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Estimate Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-800">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Estimate
          </h3>
        </div>
        <div className="p-4">
          {hasEstimate ? (
            <div>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(estimateAmount)}</p>
              {job.square_footage && (
                <p className="text-xs text-gray-500 mt-1">
                  {formatCurrency(estimateAmount / job.square_footage)}/sq ft &middot; {job.square_footage} sq ft
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-2">
              <p className="text-sm text-gray-400 mb-3">No estimate yet.</p>
              <p className="text-xs text-gray-400">Add line items to build an estimate.</p>
            </div>
          )}
        </div>
      </div>

      {/* Invoice Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-800">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            <Receipt className="w-4 h-4" />
            Invoice
          </h3>
        </div>
        <div className="p-4">
          {invoices.length > 0 ? (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <Link
                  key={inv.id}
                  href={`/dashboard/invoices/${inv.id}`}
                  className="flex items-center justify-between hover:bg-gray-50 -mx-2 px-2 py-1 rounded transition-colors"
                >
                  <div>
                    <span className="text-sm font-medium text-gray-900">{inv.invoice_number}</span>
                    <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${invoiceStatusColors[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {inv.status}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{formatCurrency(inv.amount)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-2">
              <p className="text-sm text-gray-400 mb-3">
                {job.status === 'completed' || job.status === 'in_progress'
                  ? 'Ready to invoice.'
                  : 'No invoices yet.'}
              </p>
              <Link
                href={`/dashboard/invoices/new?job=${job.id}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
              >
                <Receipt className="w-4 h-4" />
                Create Invoice
              </Link>
            </div>
          )}
          {invoices.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <Link
                href={`/dashboard/invoices/new?job=${job.id}`}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors text-sm font-medium"
              >
                <Receipt className="w-3.5 h-3.5" />
                Create Another Invoice
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
