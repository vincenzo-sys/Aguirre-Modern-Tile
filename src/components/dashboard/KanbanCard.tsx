import Link from 'next/link'
import { Calendar, User } from 'lucide-react'
import type { JobWithAssignee } from '@/lib/supabase/types'

interface KanbanCardProps {
  job: JobWithAssignee
  onDragStart: (e: React.DragEvent, jobId: string) => void
  draggable: boolean
}

export default function KanbanCard({ job, onDragStart, draggable }: KanbanCardProps) {
  const initial = job.assignee?.full_name?.charAt(0) ?? '?'

  return (
    <Link
      href={`/dashboard/jobs/${job.id}`}
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) {
          e.preventDefault()
          return
        }
        onDragStart(e, job.id)
      }}
      className="block bg-white rounded-md border border-gray-200 p-3 shadow-sm hover:shadow-md hover:border-primary-300 transition-all cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-400 font-mono">#{job.job_number}</p>
          <p className="text-sm font-semibold text-gray-900 truncate mt-0.5">{job.title}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{job.client_name}</p>
        </div>
        {job.assignee && (
          <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold shrink-0">
            {initial}
          </div>
        )}
      </div>
      {job.scheduled_start && (
        <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
          <Calendar className="w-3 h-3" />
          {new Date(job.scheduled_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      )}
    </Link>
  )
}
