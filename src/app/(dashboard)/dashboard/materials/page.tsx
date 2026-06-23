import Link from 'next/link'
import { Package, ShoppingCart, CheckCircle2 } from 'lucide-react'
import MaterialsRows from '@/components/dashboard/MaterialsRows'
import type { Job, JobLineItem, MaterialStatus } from '@/lib/supabase/types'

type WindowKey = '7' | '14' | '30'

const windowLabels: Record<WindowKey, string> = {
  '7': 'Next 7 days',
  '14': 'Next 14 days',
  '30': 'Next 30 days',
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
    .select('id, title, status, scheduled_start, scheduled_end, line_items, amount_paid')
    .gte('scheduled_start', todayStr)
    .lte('scheduled_start', endStr)
    .not('status', 'in', '("completed","paid","cancelled")')
    .gt('amount_paid', 0)
    .order('scheduled_start', { ascending: true })

  const jobs = (jobsRaw ?? []) as Pick<
    Job,
    'id' | 'title' | 'status' | 'scheduled_start' | 'scheduled_end' | 'line_items' | 'amount_paid'
  >[]

  // Per-job line items, passed to the client island so it can re-match and
  // PATCH a material's status back to the right job(s) without an extra fetch.
  const lineItemsByJob: Record<string, JobLineItem[]> = {}
  for (const job of jobs) {
    lineItemsByJob[job.id] = (job.line_items ?? []) as JobLineItem[]
  }

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
            Rollup across {jobs.length} deposit-received job{jobs.length !== 1 ? 's' : ''} in the {windowLabels[windowKey].toLowerCase()}.
            <span className="block text-xs text-gray-400 mt-0.5">
              Only jobs where the 10% deposit has landed are included — so nothing gets bought on a job that hasn't committed.
            </span>
          </p>
        </div>

        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto">
          {(['7', '14', '30'] as WindowKey[]).map((k) => (
            <Link
              key={k}
              href={`/dashboard/materials?window=${k}`}
              className={`min-h-[44px] flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
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
        <MaterialsRows
          rows={rows.map((r) => ({
            key: r.key,
            description: r.description,
            unit: r.unit,
            totalQty: r.totalQty,
            jobs: r.jobs,
          }))}
          lineItemsByJob={lineItemsByJob}
        />
      )}
    </div>
  )
}
