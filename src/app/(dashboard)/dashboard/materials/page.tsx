import Link from 'next/link'
import { Package, ShoppingCart, Truck, CheckCircle2 } from 'lucide-react'
import type { Job, JobLineItem, MaterialStatus } from '@/lib/supabase/types'

type WindowKey = '7' | '14' | '30'

const windowLabels: Record<WindowKey, string> = {
  '7': 'Next 7 days',
  '14': 'Next 14 days',
  '30': 'Next 30 days',
}

const statusMeta: Record<MaterialStatus, { label: string; icon: typeof Package; className: string }> = {
  needed: { label: 'Needed', icon: Package, className: 'bg-gray-100 text-gray-700' },
  ordered: { label: 'Ordered', icon: ShoppingCart, className: 'bg-blue-100 text-blue-700' },
  received: { label: 'Received', icon: Truck, className: 'bg-yellow-100 text-yellow-700' },
  on_site: { label: 'On site', icon: CheckCircle2, className: 'bg-green-100 text-green-700' },
}

type MaterialRow = {
  key: string
  description: string
  unit: string
  totalQty: number
  totalAmount: number
  statusCounts: Record<MaterialStatus, number>
  jobs: { id: string; title: string; quantity: number; status: MaterialStatus }[]
}

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>
}) {
  const params = await searchParams
  const windowKey: WindowKey =
    params.window === '14' ? '14' : params.window === '30' ? '30' : '7'
  const days = parseInt(windowKey, 10)

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const today = new Date()
  const end = new Date(today)
  end.setDate(end.getDate() + days)
  const todayStr = today.toISOString().slice(0, 10)
  const endStr = end.toISOString().slice(0, 10)

  const { data: jobsRaw } = await supabase
    .from('jobs')
    .select('id, title, status, scheduled_start, scheduled_end, line_items')
    .gte('scheduled_start', todayStr)
    .lte('scheduled_start', endStr)
    .not('status', 'in', '("completed","paid","cancelled")')
    .order('scheduled_start', { ascending: true })

  const jobs = (jobsRaw ?? []) as Pick<
    Job,
    'id' | 'title' | 'status' | 'scheduled_start' | 'scheduled_end' | 'line_items'
  >[]

  const rollup: Record<string, MaterialRow> = {}
  for (const job of jobs) {
    const items = (job.line_items ?? []) as JobLineItem[]
    for (const item of items) {
      if (item.category !== 'materials') continue
      const key = `${item.description.trim().toLowerCase()}|${item.unit}`
      const status: MaterialStatus = item.status ?? 'needed'
      if (!rollup[key]) {
        rollup[key] = {
          key,
          description: item.description,
          unit: item.unit,
          totalQty: 0,
          totalAmount: 0,
          statusCounts: { needed: 0, ordered: 0, received: 0, on_site: 0 },
          jobs: [],
        }
      }
      rollup[key].totalQty += Number(item.quantity) || 0
      rollup[key].totalAmount += Number(item.amount) || 0
      rollup[key].statusCounts[status]++
      rollup[key].jobs.push({
        id: job.id,
        title: job.title,
        quantity: Number(item.quantity) || 0,
        status,
      })
    }
  }

  const rows = Object.values(rollup).sort((a, b) => {
    const aNeedsOrder = a.statusCounts.needed > 0 || a.statusCounts.ordered > 0
    const bNeedsOrder = b.statusCounts.needed > 0 || b.statusCounts.ordered > 0
    if (aNeedsOrder !== bNeedsOrder) return aNeedsOrder ? -1 : 1
    return a.description.localeCompare(b.description)
  })

  const totalNeeded = rows.reduce((sum, r) => sum + r.statusCounts.needed, 0)
  const totalOrdered = rows.reduce((sum, r) => sum + r.statusCounts.ordered, 0)
  const totalReady = rows.reduce((sum, r) => sum + r.statusCounts.received + r.statusCounts.on_site, 0)

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Materials</h1>
          <p className="text-sm text-gray-500 mt-1">
            Rollup across {jobs.length} upcoming job{jobs.length !== 1 ? 's' : ''} in the {windowLabels[windowKey].toLowerCase()}
          </p>
        </div>

        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['7', '14', '30'] as WindowKey[]).map((k) => (
            <Link
              key={k}
              href={`/dashboard/materials?window=${k}`}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                windowKey === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {windowLabels[k]}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wider mb-1">
            <Package className="w-4 h-4" />
            Still needed
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalNeeded}</p>
          <p className="text-xs text-gray-500 mt-1">across jobs</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-blue-600 text-xs uppercase tracking-wider mb-1">
            <ShoppingCart className="w-4 h-4" />
            Ordered
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalOrdered}</p>
          <p className="text-xs text-gray-500 mt-1">waiting to arrive</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-green-600 text-xs uppercase tracking-wider mb-1">
            <CheckCircle2 className="w-4 h-4" />
            Ready
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalReady}</p>
          <p className="text-xs text-gray-500 mt-1">received or on site</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No materials needed for upcoming jobs.</p>
          <p className="text-xs text-gray-400 mt-1">Add material line items on a job to see them aggregated here.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Material
                </th>
                <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                  Total qty
                </th>
                <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Jobs
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.key} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{row.description}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {(Object.keys(row.statusCounts) as MaterialStatus[]).map((s) => {
                        if (row.statusCounts[s] === 0) return null
                        const meta = statusMeta[s]
                        const Icon = meta.icon
                        return (
                          <span
                            key={s}
                            className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${meta.className}`}
                          >
                            <Icon className="w-2.5 h-2.5" />
                            {row.statusCounts[s]} {meta.label.toLowerCase()}
                          </span>
                        )
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {row.totalQty} {row.unit}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      {row.jobs.map((j, i) => (
                        <Link
                          key={`${j.id}-${i}`}
                          href={`/dashboard/jobs/${j.id}`}
                          className="text-xs text-primary-600 hover:underline block truncate max-w-xs"
                        >
                          {j.title} ({j.quantity} {row.unit})
                        </Link>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
