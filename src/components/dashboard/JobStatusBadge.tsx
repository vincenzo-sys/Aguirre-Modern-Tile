import type { JobStatus } from '@/lib/supabase/types'

const statusConfig: Record<JobStatus, { label: string; className: string }> = {
  lead: { label: 'Lead', className: 'bg-yellow-100 text-yellow-800' },
  quoted: { label: 'Quoted', className: 'bg-blue-100 text-blue-800' },
  scheduled: { label: 'Scheduled', className: 'bg-purple-100 text-purple-800' },
  in_progress: { label: 'In Progress', className: 'bg-orange-100 text-orange-800' },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-800' },
  paid: { label: 'Paid', className: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-800' },
}

export default function JobStatusBadge({ status }: { status: JobStatus }) {
  const config = statusConfig[status]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
