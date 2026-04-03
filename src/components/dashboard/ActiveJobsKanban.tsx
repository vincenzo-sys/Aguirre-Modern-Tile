import Link from 'next/link'
import type { JobWithAssignee } from '@/lib/supabase/types'

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

const columns = [
  { key: 'in_progress', label: 'In Progress', color: 'border-blue-500' },
  { key: 'scheduled', label: 'Scheduled', color: 'border-indigo-400' },
  { key: 'quoted', label: 'Quoted', color: 'border-gray-400' },
] as const

export default function ActiveJobsKanban({ jobs }: { jobs: JobWithAssignee[] }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">
        Active Jobs
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {columns.map((col) => {
          const colJobs = jobs.filter((j) => j.status === col.key)
          return (
            <div key={col.key}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-2 h-2 rounded-full ${col.color.replace('border-', 'bg-')}`} />
                <span className="text-xs font-medium text-gray-500 uppercase">
                  {col.label} ({colJobs.length})
                </span>
              </div>
              {colJobs.length === 0 ? (
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
                  <span className="text-xs text-gray-400">None</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {colJobs.map((job) => (
                    <Link
                      key={job.id}
                      href={`/dashboard/jobs/${job.id}`}
                      className={`block p-3 rounded-lg border-l-4 ${col.color} bg-gray-50 hover:bg-gray-100 transition-colors`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {job.client_name}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{job.title}</p>
                          {job.assignee && (
                            <p className="text-xs text-gray-400 mt-1">
                              {job.assignee.full_name}
                            </p>
                          )}
                        </div>
                        {job.status === 'in_progress' && job.scheduled_start && (
                          <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                            {daysSince(job.scheduled_start)}d
                          </span>
                        )}
                        {job.status === 'scheduled' && (
                          <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
                            Queue
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
