import type { Job } from '@/lib/supabase/types'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default function JobPerformance({ job }: { job: Job }) {
  const showPerformance = ['in_progress', 'completed', 'paid'].includes(job.status)
  if (!showPerformance) return null

  const estDays = job.estimated_days
  const actDays = job.actual_days
  const estCost = job.estimated_cost
  const actCost = job.actual_cost

  const hasDaysData = estDays != null && actDays != null
  const hasCostData = estCost != null && actCost != null

  if (!hasDaysData && !hasCostData) return null

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Performance</h2>

      <div className="space-y-5">
        {hasDaysData && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-600">Days</span>
              <DaysLabel estimated={estDays!} actual={actDays!} />
            </div>
            <div className="flex gap-3 items-center">
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1">Estimated: {estDays} days</p>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-400 rounded-full" style={{ width: '100%' }} />
                </div>
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1">Actual: {actDays} days</p>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${actDays! <= estDays! ? 'bg-green-400' : 'bg-red-400'}`}
                    style={{ width: `${Math.min((actDays! / estDays!) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {hasCostData && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-600">Cost</span>
              <CostLabel estimated={estCost!} actual={actCost!} />
            </div>
            <div className="flex gap-3 items-center">
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1">Estimated: {fmt.format(estCost!)}</p>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-400 rounded-full" style={{ width: '100%' }} />
                </div>
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1">Actual: {fmt.format(actCost!)}</p>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${actCost! <= estCost! ? 'bg-green-400' : 'bg-red-400'}`}
                    style={{ width: `${Math.min((actCost! / estCost!) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DaysLabel({ estimated, actual }: { estimated: number; actual: number }) {
  const diff = actual - estimated
  if (diff === 0) return <span className="text-xs font-medium text-green-600">On schedule</span>
  if (diff < 0) return <span className="text-xs font-medium text-green-600">{Math.abs(diff)} day{Math.abs(diff) !== 1 ? 's' : ''} ahead</span>
  return <span className="text-xs font-medium text-red-600">{diff} day{diff !== 1 ? 's' : ''} over estimate</span>
}

function CostLabel({ estimated, actual }: { estimated: number; actual: number }) {
  const diff = actual - estimated
  if (diff <= 0) return <span className="text-xs font-medium text-green-600">{fmt.format(Math.abs(diff))} under budget</span>
  return <span className="text-xs font-medium text-red-600">{fmt.format(diff)} over budget</span>
}
