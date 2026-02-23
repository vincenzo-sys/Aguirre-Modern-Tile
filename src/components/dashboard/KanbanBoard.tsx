'use client'

import { useState } from 'react'
import KanbanCard from './KanbanCard'
import type { JobStatus, JobWithAssignee, Profile } from '@/lib/supabase/types'

const columns: { status: JobStatus; label: string; color: string }[] = [
  { status: 'lead', label: 'Lead', color: 'border-yellow-400' },
  { status: 'quoted', label: 'Quoted', color: 'border-blue-400' },
  { status: 'scheduled', label: 'Scheduled', color: 'border-purple-400' },
  { status: 'in_progress', label: 'In Progress', color: 'border-orange-400' },
  { status: 'completed', label: 'Completed', color: 'border-green-400' },
  { status: 'paid', label: 'Paid', color: 'border-emerald-400' },
]

interface KanbanBoardProps {
  initialJobs: JobWithAssignee[]
  isOwner: boolean
  profile: Profile
}

export default function KanbanBoard({ initialJobs, isOwner, profile }: KanbanBoardProps) {
  const [jobs, setJobs] = useState(initialJobs)
  const [dragOverCol, setDragOverCol] = useState<JobStatus | null>(null)

  function canDrag(job: JobWithAssignee) {
    if (isOwner) return true
    return job.assigned_to === profile.id
  }

  function handleDragStart(e: React.DragEvent, jobId: string) {
    e.dataTransfer.setData('text/plain', jobId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, status: JobStatus) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCol(status)
  }

  function handleDragLeave() {
    setDragOverCol(null)
  }

  function handleDrop(e: React.DragEvent, newStatus: JobStatus) {
    e.preventDefault()
    setDragOverCol(null)
    const jobId = e.dataTransfer.getData('text/plain')
    if (!jobId) return

    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j))
    )
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
      {columns.map((col) => {
        const colJobs = jobs.filter((j) => j.status === col.status)
        return (
          <div
            key={col.status}
            className={`flex-shrink-0 w-64 bg-gray-50 rounded-lg border-t-4 ${col.color} ${
              dragOverCol === col.status ? 'ring-2 ring-primary-300 bg-primary-50' : ''
            }`}
            onDragOver={(e) => handleDragOver(e, col.status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.status)}
          >
            <div className="px-3 py-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
              <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">
                {colJobs.length}
              </span>
            </div>
            <div className="px-2 pb-2 space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto">
              {colJobs.map((job) => (
                <KanbanCard
                  key={job.id}
                  job={job}
                  onDragStart={handleDragStart}
                  draggable={canDrag(job)}
                />
              ))}
              {colJobs.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No jobs</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
