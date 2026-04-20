import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ClipboardList, ArrowRight } from 'lucide-react'
import type { Job, QuoteRequest } from '@/lib/supabase/types'

type WorklistBucket =
  | 'needs_estimate'
  | 'awaiting_deposit'
  | 'needs_scheduling'
  | 'scheduled'
  | 'in_flight'
  | 'awaiting_final'

const bucketOrder: WorklistBucket[] = [
  'needs_estimate',
  'awaiting_deposit',
  'needs_scheduling',
  'scheduled',
  'in_flight',
  'awaiting_final',
]

const bucketLabel: Record<WorklistBucket, string> = {
  needs_estimate: 'Needs estimate',
  awaiting_deposit: 'Awaiting deposit',
  needs_scheduling: 'Needs scheduling',
  scheduled: 'Scheduled',
  in_flight: 'In progress',
  awaiting_final: 'Awaiting final payment',
}

const bucketColor: Record<WorklistBucket, string> = {
  needs_estimate: 'bg-red-100 text-red-700 border-red-200',
  awaiting_deposit: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  needs_scheduling: 'bg-orange-100 text-orange-800 border-orange-200',
  scheduled: 'bg-purple-100 text-purple-800 border-purple-200',
  in_flight: 'bg-blue-100 text-blue-800 border-blue-200',
  awaiting_final: 'bg-emerald-100 text-emerald-800 border-emerald-200',
}

type WorklistItem = {
  bucket: WorklistBucket
  kind: 'lead' | 'job'
  id: string
  href: string
  name: string
  projectType: string
  subtitle: string
  readinessIssues?: string[]
}

function format(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = dateStr.includes('T')
    ? new Date(dateStr)
    : new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function jobReadinessIssues(job: Job): string[] {
  const issues: string[] = []
  if (!job.scope_notes || job.scope_notes.trim() === '') issues.push('no scope')
  if (!job.assigned_to) issues.push('not assigned')
  if (!job.line_items || job.line_items.length === 0) issues.push('no line items')
  if (!job.crew_instructions || job.crew_instructions.trim() === '') {
    issues.push('no crew instructions')
  }
  return issues
}

export default function SalesWorklist({
  leads,
  jobs,
}: {
  leads: QuoteRequest[]
  jobs: Job[]
}) {
  const todayStr = new Date().toISOString().slice(0, 10)

  const items: WorklistItem[] = []

  // Leads → needs estimate / site visit
  for (const lead of leads) {
    if (lead.status !== 'new' && lead.status !== 'reviewed') continue
    if (lead.converted_job_id) continue

    // Skip if there's a future site visit — it'll surface on Today card, not as needs-estimate
    if (lead.site_visit_at) {
      const visitDay = lead.site_visit_at.slice(0, 10)
      if (visitDay > todayStr) continue
    }

    items.push({
      bucket: 'needs_estimate',
      kind: 'lead',
      id: lead.id,
      href: `/dashboard/leads/${lead.id}`,
      name: lead.client_name,
      projectType: lead.project_type,
      subtitle: lead.site_visit_at
        ? `Visited ${format(lead.site_visit_at)} · create estimate`
        : 'No site visit yet',
    })
  }

  // Jobs → buckets by status + money
  for (const job of jobs) {
    if (job.status === 'cancelled') continue

    // Awaiting deposit
    if ((job.status === 'lead' || job.status === 'quoted') && (job.amount_paid ?? 0) <= 0) {
      items.push({
        bucket: 'awaiting_deposit',
        kind: 'job',
        id: job.id,
        href: `/dashboard/jobs/${job.id}`,
        name: job.client_name,
        projectType: job.job_type || 'Tile',
        subtitle: job.estimated_cost
          ? `Quoted $${Number(job.estimated_cost).toLocaleString()}`
          : 'Quote sent',
      })
      continue
    }

    // Needs scheduling — deposit received, no start date yet
    if ((job.status === 'lead' || job.status === 'quoted') && !job.scheduled_start) {
      items.push({
        bucket: 'needs_scheduling',
        kind: 'job',
        id: job.id,
        href: `/dashboard/jobs/${job.id}`,
        name: job.client_name,
        projectType: job.job_type || 'Tile',
        subtitle: `Deposit received · pick a date`,
      })
      continue
    }

    // Scheduled (future or today) — include readiness check
    if (job.status === 'scheduled' || job.status === 'waiting_for_materials') {
      const readinessIssues = jobReadinessIssues(job)
      items.push({
        bucket: 'scheduled',
        kind: 'job',
        id: job.id,
        href: `/dashboard/jobs/${job.id}`,
        name: job.client_name,
        projectType: job.job_type || 'Tile',
        subtitle: job.scheduled_start ? `Starts ${format(job.scheduled_start)}` : 'No date',
        readinessIssues,
      })
      continue
    }

    // In progress
    if (job.status === 'in_progress') {
      items.push({
        bucket: 'in_flight',
        kind: 'job',
        id: job.id,
        href: `/dashboard/jobs/${job.id}`,
        name: job.client_name,
        projectType: job.job_type || 'Tile',
        subtitle: job.scheduled_start ? `Started ${format(job.scheduled_start)}` : 'Active',
      })
      continue
    }

    // Completed, awaiting final payment
    if (job.status === 'completed') {
      const due = (job.estimated_cost ?? 0) - (job.amount_paid ?? 0)
      if (due > 0) {
        items.push({
          bucket: 'awaiting_final',
          kind: 'job',
          id: job.id,
          href: `/dashboard/jobs/${job.id}`,
          name: job.client_name,
          projectType: job.job_type || 'Tile',
          subtitle: `Final $${Math.round(due).toLocaleString()} owed`,
        })
      }
    }
  }

  // Group by bucket
  const grouped: Record<WorklistBucket, WorklistItem[]> = {
    needs_estimate: [],
    awaiting_deposit: [],
    needs_scheduling: [],
    scheduled: [],
    in_flight: [],
    awaiting_final: [],
  }
  for (const item of items) grouped[item.bucket].push(item)

  const total = items.length

  if (total === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">Nothing needs attention right now.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Worklist</h2>
          <p className="text-xs text-gray-500 mt-0.5">Everything open, grouped by what it needs next.</p>
        </div>
        <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
          {total} item{total === 1 ? '' : 's'}
        </span>
      </div>

      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-2">
              Customer
            </th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2">
              Type
            </th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2">
              Status
            </th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2">
              Detail
            </th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {bucketOrder.map((bucket) => {
            const rows = grouped[bucket]
            if (rows.length === 0) return null
            return rows.map((item, idx) => (
              <tr key={`${item.kind}-${item.id}`} className="hover:bg-gray-50">
                <td className="px-5 py-3">
                  <Link
                    href={item.href}
                    className="text-sm font-medium text-gray-900 hover:text-primary-600"
                  >
                    {item.name}
                  </Link>
                </td>
                <td className="px-3 py-3 text-sm text-gray-600 capitalize">{item.projectType}</td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${bucketColor[bucket]}`}
                  >
                    {bucketLabel[bucket]}
                  </span>
                </td>
                <td className="px-3 py-3 text-sm text-gray-500">
                  <div>{item.subtitle}</div>
                  {item.readinessIssues !== undefined && (
                    item.readinessIssues.length === 0 ? (
                      <div className="inline-flex items-center gap-1 text-xs text-green-700 mt-0.5">
                        <CheckCircle2 className="w-3 h-3" />
                        Ready for Christian
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1 text-xs text-red-700 mt-0.5">
                        <AlertTriangle className="w-3 h-3" />
                        Missing: {item.readinessIssues.join(', ')}
                      </div>
                    )
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <Link
                    href={item.href}
                    className="inline-flex items-center text-gray-400 hover:text-primary-600"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </td>
              </tr>
            ))
          })}
        </tbody>
      </table>
    </div>
  )
}
