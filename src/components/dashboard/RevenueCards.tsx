import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react'
import type { Job, Invoice } from '@/lib/supabase/types'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount)
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

function isThisWeek(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)
  return d >= startOfWeek
}

function isThisMonth(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

export default function RevenueCards({
  jobs,
  invoices,
}: {
  jobs: Job[]
  invoices: Invoice[]
}) {
  const paidInvoices = invoices.filter((inv) => inv.status === 'paid')

  const todayRevenue = paidInvoices
    .filter((inv) => isToday(inv.updated_at))
    .reduce((sum, inv) => sum + inv.amount, 0)

  const weekRevenue = paidInvoices
    .filter((inv) => isThisWeek(inv.updated_at))
    .reduce((sum, inv) => sum + inv.amount, 0)

  const monthRevenue = paidInvoices
    .filter((inv) => isThisMonth(inv.updated_at))
    .reduce((sum, inv) => sum + inv.amount, 0)

  const completedJobs = jobs.filter((j) => j.status === 'completed' || j.status === 'paid')
  const avgJobValue = completedJobs.length > 0
    ? completedJobs.reduce((sum, j) => sum + (j.amount_paid ?? 0), 0) / completedJobs.length
    : 0

  const cards = [
    { label: "Today's Revenue", value: todayRevenue },
    { label: 'This Week', value: weekRevenue },
    { label: 'This Month', value: monthRevenue },
    { label: 'Avg Job Value', value: avgJobValue },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
        >
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {card.label}
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatCurrency(card.value)}
          </p>
        </div>
      ))}
    </div>
  )
}
