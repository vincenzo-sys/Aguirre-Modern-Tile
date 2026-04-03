import Link from 'next/link'
import type { Invoice, Job } from '@/lib/supabase/types'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount)
}

function daysOverdue(dueDateStr: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dueDateStr).getTime()) / (1000 * 60 * 60 * 24)))
}

export default function UnpaidJobs({
  invoices,
  jobs,
}: {
  invoices: Invoice[]
  jobs: Job[]
}) {
  const outstanding = invoices.filter((inv) => inv.status === 'sent' || inv.status === 'overdue')
  const total = outstanding.reduce((sum, inv) => sum + inv.amount, 0)

  const jobMap = new Map(jobs.map((j) => [j.id, j]))

  if (outstanding.length === 0) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="px-4 py-3 bg-gray-800 rounded-t-xl flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
          Unpaid / Outstanding
        </h3>
      </div>
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-2xl font-bold text-gray-900">{formatCurrency(total)}</p>
        <p className="text-xs text-gray-500">across {outstanding.length} invoice{outstanding.length !== 1 ? 's' : ''}</p>
      </div>
      <div className="divide-y divide-gray-100">
        {outstanding.slice(0, 5).map((inv) => {
          const job = jobMap.get(inv.job_id)
          const overdue = daysOverdue(inv.due_date)
          return (
            <Link
              key={inv.id}
              href={`/dashboard/invoices/${inv.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{job?.client_name ?? 'Unknown'}</p>
                <p className="text-xs text-gray-500">{job?.title ?? inv.invoice_number}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">{formatCurrency(inv.amount)}</span>
                {overdue > 0 && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                    {overdue}d
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
