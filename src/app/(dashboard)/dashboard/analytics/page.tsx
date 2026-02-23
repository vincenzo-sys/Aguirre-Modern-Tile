import { isDemoMode, demoJobs, demoTeamMembers } from '@/lib/demo'
import type { Job, Profile, JobWithAssignee } from '@/lib/supabase/types'
import AnalyticsBarChart from '@/components/dashboard/AnalyticsBarChart'
import { DollarSign, TrendingUp, Clock, Users } from 'lucide-react'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const statusColors: Record<string, string> = {
  lead: '#eab308',
  quoted: '#3b82f6',
  scheduled: '#a855f7',
  in_progress: '#f97316',
  completed: '#22c55e',
  paid: '#10b981',
  cancelled: '#9ca3af',
}

export default async function AnalyticsPage() {
  let jobs: JobWithAssignee[] = []
  let team: Profile[] = []

  if (isDemoMode) {
    jobs = demoJobs
    team = demoTeamMembers
  } else {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()

    const { data: jobData } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false })
    jobs = (jobData ?? []) as JobWithAssignee[]

    const { data: teamData } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_active', true)
    team = (teamData ?? []) as Profile[]
  }

  // Summary calculations
  const totalRevenue = jobs.reduce((sum, j) => sum + (j.amount_paid ?? 0), 0)
  const paidJobs = jobs.filter((j) => j.amount_paid && j.amount_paid > 0)
  const avgJobValue = paidJobs.length > 0 ? totalRevenue / paidJobs.length : 0

  const completedJobs = jobs.filter((j) => j.status === 'completed' || j.status === 'paid')
  const onTimeJobs = completedJobs.filter(
    (j) => j.actual_days != null && j.estimated_days != null && j.actual_days <= j.estimated_days
  )
  const onTimeRate = completedJobs.length > 0 ? Math.round((onTimeJobs.length / completedJobs.length) * 100) : 0

  const pipelineStatuses = ['lead', 'quoted', 'scheduled', 'in_progress']
  const pipelineValue = jobs
    .filter((j) => pipelineStatuses.includes(j.status))
    .reduce((sum, j) => sum + (j.estimated_cost ?? 0), 0)

  // Jobs by status
  const statusCounts = ['lead', 'quoted', 'scheduled', 'in_progress', 'completed', 'paid'].map((status) => ({
    label: status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    value: jobs.filter((j) => j.status === status).length,
    color: statusColors[status] || '#9ca3af',
  }))

  // Budget performance (completed/paid jobs with both estimated & actual costs)
  const budgetJobs = jobs.filter(
    (j) => (j.status === 'completed' || j.status === 'paid') && j.estimated_cost && j.actual_cost
  )

  // Days performance
  const daysJobs = jobs.filter(
    (j) => (j.status === 'completed' || j.status === 'paid') && j.estimated_days && j.actual_days
  )

  // Team workload
  const teamWorkload = team.map((member) => {
    const memberJobs = jobs.filter((j) => j.assigned_to === member.id)
    return {
      name: member.full_name,
      assigned: memberJobs.length,
      active: memberJobs.filter((j) => j.status === 'in_progress' || j.status === 'scheduled').length,
      completed: memberJobs.filter((j) => j.status === 'completed' || j.status === 'paid').length,
    }
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Business performance overview</p>
      </div>

      {isDemoMode && (
        <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 p-3">
          <p className="text-sm text-amber-800">
            <strong>Demo Mode</strong> — Computed from sample data.
          </p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard icon={DollarSign} label="Total Revenue" value={fmt.format(totalRevenue)} color="bg-green-100 text-green-600" />
        <SummaryCard icon={TrendingUp} label="Avg Job Value" value={fmt.format(avgJobValue)} color="bg-blue-100 text-blue-600" />
        <SummaryCard icon={Clock} label="On-Time Rate" value={`${onTimeRate}%`} color="bg-purple-100 text-purple-600" />
        <SummaryCard icon={DollarSign} label="Pipeline Value" value={fmt.format(pipelineValue)} color="bg-orange-100 text-orange-600" />
      </div>

      {/* Jobs by Status */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Jobs by Status</h2>
        <AnalyticsBarChart bars={statusCounts} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Budget Performance */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Budget Performance</h2>
          {budgetJobs.length === 0 ? (
            <p className="text-sm text-gray-500">No completed jobs with cost data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 text-gray-500 font-medium">Job</th>
                    <th className="text-right py-2 text-gray-500 font-medium">Estimated</th>
                    <th className="text-right py-2 text-gray-500 font-medium">Actual</th>
                    <th className="text-right py-2 text-gray-500 font-medium">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetJobs.map((j) => {
                    const variance = (j.estimated_cost ?? 0) - (j.actual_cost ?? 0)
                    const pct = j.estimated_cost ? Math.round((variance / j.estimated_cost) * 100) : 0
                    return (
                      <tr key={j.id} className="border-b border-gray-100">
                        <td className="py-2 text-gray-900">#{j.job_number} {j.title}</td>
                        <td className="py-2 text-right text-gray-600">{fmt.format(j.estimated_cost!)}</td>
                        <td className="py-2 text-right text-gray-600">{fmt.format(j.actual_cost!)}</td>
                        <td className={`py-2 text-right font-medium ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {variance >= 0 ? '+' : ''}{fmt.format(variance)} ({pct > 0 ? '+' : ''}{pct}%)
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Days Performance */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Days Performance</h2>
          {daysJobs.length === 0 ? (
            <p className="text-sm text-gray-500">No completed jobs with days data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 text-gray-500 font-medium">Job</th>
                    <th className="text-right py-2 text-gray-500 font-medium">Est. Days</th>
                    <th className="text-right py-2 text-gray-500 font-medium">Actual</th>
                    <th className="text-right py-2 text-gray-500 font-medium">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {daysJobs.map((j) => {
                    const diff = (j.actual_days ?? 0) - (j.estimated_days ?? 0)
                    return (
                      <tr key={j.id} className="border-b border-gray-100">
                        <td className="py-2 text-gray-900">#{j.job_number} {j.title}</td>
                        <td className="py-2 text-right text-gray-600">{j.estimated_days}</td>
                        <td className="py-2 text-right text-gray-600">{j.actual_days}</td>
                        <td className={`py-2 text-right font-medium ${diff <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {diff <= 0 ? diff : `+${diff}`} day{Math.abs(diff) !== 1 ? 's' : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Team Workload */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5" />
          Team Workload
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 text-gray-500 font-medium">Team Member</th>
                <th className="text-right py-2 text-gray-500 font-medium">Assigned</th>
                <th className="text-right py-2 text-gray-500 font-medium">Active</th>
                <th className="text-right py-2 text-gray-500 font-medium">Completed</th>
              </tr>
            </thead>
            <tbody>
              {teamWorkload.map((w) => (
                <tr key={w.name} className="border-b border-gray-100">
                  <td className="py-2 text-gray-900 font-medium">{w.name}</td>
                  <td className="py-2 text-right text-gray-600">{w.assigned}</td>
                  <td className="py-2 text-right text-gray-600">{w.active}</td>
                  <td className="py-2 text-right text-gray-600">{w.completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  color: string
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  )
}
