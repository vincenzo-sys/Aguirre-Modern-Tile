import { DollarSign } from 'lucide-react'
import type { Job } from '@/lib/supabase/types'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default function FinancialsCard({ job }: { job: Job }) {
  const estimated = job.estimated_cost ?? 0
  const actual = job.actual_cost ?? 0
  const invoiced = job.amount_invoiced ?? 0
  const paid = job.amount_paid ?? 0
  const balanceDue = invoiced - paid

  const hasActual = job.actual_cost != null
  const variance = hasActual ? estimated - actual : null
  const isUnder = variance !== null && variance >= 0
  const isOver = variance !== null && variance < 0

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <DollarSign className="w-5 h-5" />
        Financials
      </h2>

      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="text-xs text-gray-500">Estimated Cost</dt>
          <dd className="text-lg font-bold text-gray-900">{estimated ? fmt.format(estimated) : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Actual Cost</dt>
          <dd className="text-lg font-bold text-gray-900">{hasActual ? fmt.format(actual) : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Invoiced</dt>
          <dd className="text-lg font-bold text-gray-900">{invoiced ? fmt.format(invoiced) : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Paid</dt>
          <dd className="text-lg font-bold text-gray-900">{paid ? fmt.format(paid) : '—'}</dd>
        </div>
      </dl>

      {variance !== null && (
        <div className={`mt-4 p-3 rounded-md ${isUnder ? 'bg-green-50' : 'bg-red-50'}`}>
          <p className={`text-sm font-medium ${isUnder ? 'text-green-700' : 'text-red-700'}`}>
            {isUnder
              ? `${fmt.format(Math.abs(variance))} under budget`
              : `${fmt.format(Math.abs(variance))} over budget`}
          </p>
        </div>
      )}

      {balanceDue > 0 && (
        <div className="mt-3 p-3 rounded-md bg-amber-50">
          <p className="text-sm font-medium text-amber-700">
            Balance due: {fmt.format(balanceDue)}
          </p>
        </div>
      )}
    </div>
  )
}
