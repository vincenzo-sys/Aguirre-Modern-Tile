import Link from 'next/link'
import { Calendar, User, MapPin } from 'lucide-react'
import JobStatusBadge from './JobStatusBadge'
import type { JobWithAssignee } from '@/lib/supabase/types'

export default function JobCard({ job }: { job: JobWithAssignee }) {
  return (
    <Link
      href={`/dashboard/jobs/${job.id}`}
      className="block bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md hover:border-primary-300 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm text-gray-500 font-mono">#{job.job_number}</span>
            <JobStatusBadge status={job.status} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 truncate">{job.title}</h3>
          <p className="text-sm text-gray-600 mt-0.5">{job.client_name}</p>
        </div>
        {job.job_type && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded shrink-0">
            {job.job_type}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-500">
        {job.scheduled_start && (
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            {new Date(job.scheduled_start).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        )}
        {job.assignee && (
          <span className="flex items-center gap-1.5">
            <User className="w-4 h-4" />
            {job.assignee.full_name}
          </span>
        )}
        {job.client_address && (
          <span className="flex items-center gap-1.5 truncate">
            <MapPin className="w-4 h-4 shrink-0" />
            <span className="truncate">{job.client_address}</span>
          </span>
        )}
      </div>
    </Link>
  )
}
