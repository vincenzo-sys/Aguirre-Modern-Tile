import { Briefcase, Hammer, CheckCircle2, DollarSign } from 'lucide-react'
import type { JobWithAssignee } from '@/lib/supabase/types'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default function MetricsCards({ jobs }: { jobs: JobWithAssignee[] }) {
  const total = jobs.length
  const active = jobs.filter((j) => j.status === 'in_progress' || j.status === 'scheduled').length

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const completedThisMonth = jobs.filter(
    (j) =>
      (j.status === 'completed' || j.status === 'paid') &&
      new Date(j.updated_at) >= monthStart
  ).length

  const revenueThisMonth = jobs
    .filter(
      (j) =>
        (j.status === 'completed' || j.status === 'paid') &&
        new Date(j.updated_at) >= monthStart
    )
    .reduce((sum, j) => sum + (j.amount_paid ?? 0), 0)

  const cards = [
    { label: 'Total Jobs', value: total.toString(), icon: Briefcase, color: 'bg-blue-100 text-blue-600' },
    { label: 'Active Jobs', value: active.toString(), icon: Hammer, color: 'bg-orange-100 text-orange-600' },
    { label: 'Completed This Month', value: completedThisMonth.toString(), icon: CheckCircle2, color: 'bg-green-100 text-green-600' },
    { label: 'Revenue This Month', value: fmt.format(revenueThisMonth), icon: DollarSign, color: 'bg-emerald-100 text-emerald-600' },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${card.color}`}>
              <card.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              <p className="text-xs text-gray-500">{card.label}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
