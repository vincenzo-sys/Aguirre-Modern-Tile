import Link from 'next/link'
import { AlertTriangle, Inbox, Clock } from 'lucide-react'
import type { Job, Invoice, QuoteRequest } from '@/lib/supabase/types'

export default function AlertBanners({
  jobs,
  invoices,
  leads,
}: {
  jobs: Job[]
  invoices: Invoice[]
  leads: QuoteRequest[]
}) {
  const unpaidJobs = jobs.filter(
    (j) => j.status === 'completed' && (j.amount_paid ?? 0) < (j.amount_invoiced ?? 0)
  )
  const unpaidTotal = unpaidJobs.reduce(
    (sum, j) => sum + ((j.amount_invoiced ?? 0) - (j.amount_paid ?? 0)),
    0
  )

  const overdueInvoices = invoices.filter((inv) => inv.status === 'overdue' || inv.status === 'sent')

  const newLeads = leads.filter((l) => l.status === 'new')

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount)

  return (
    <div className="space-y-2">
      {unpaidJobs.length > 0 && (
        <Link
          href="/dashboard/invoices"
          className="flex items-center justify-between px-4 py-3 rounded-lg bg-red-50 border border-red-200 hover:bg-red-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-medium text-red-800">
              {unpaidJobs.length} unpaid job{unpaidJobs.length !== 1 ? 's' : ''} totaling {formatCurrency(unpaidTotal)}
            </span>
          </div>
          <span className="text-xs text-red-500">Complete but not paid</span>
        </Link>
      )}

      {newLeads.length > 0 && (
        <Link
          href="/dashboard/leads"
          className="flex items-center justify-between px-4 py-3 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-800">
              {newLeads.length} new quote request{newLeads.length !== 1 ? 's' : ''}
            </span>
          </div>
          <span className="text-xs text-blue-500">From website form</span>
        </Link>
      )}

      {overdueInvoices.length > 0 && (
        <Link
          href="/dashboard/invoices"
          className="flex items-center justify-between px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">
              {overdueInvoices.length} outstanding invoice{overdueInvoices.length !== 1 ? 's' : ''}
            </span>
          </div>
          <span className="text-xs text-amber-500">Awaiting payment</span>
        </Link>
      )}
    </div>
  )
}
