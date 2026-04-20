'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { JobWithAssignee, JobStatus } from '@/lib/supabase/types'

const statusColors: Record<JobStatus, string> = {
  lead: 'bg-yellow-200 text-yellow-900',
  quoted: 'bg-blue-200 text-blue-900',
  scheduled: 'bg-purple-200 text-purple-900',
  in_progress: 'bg-orange-200 text-orange-900',
  waiting_for_materials: 'bg-amber-200 text-amber-900',
  completed: 'bg-green-200 text-green-900',
  paid: 'bg-emerald-200 text-emerald-900',
  cancelled: 'bg-gray-200 text-gray-900',
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysBetween(from: string, to: string): number {
  const fromTime = new Date(from + 'T00:00:00').getTime()
  const toTime = new Date(to + 'T00:00:00').getTime()
  return Math.round((toTime - fromTime) / 86_400_000)
}

function shiftDate(dateStr: string, deltaDays: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

export default function CalendarView({ jobs: initialJobs }: { jobs: JobWithAssignee[] }) {
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [jobs, setJobs] = useState(initialJobs)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

  useEffect(() => {
    setJobs(initialJobs)
  }, [initialJobs])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startOffset = firstDay.getDay()
  const daysInMonth = lastDay.getDate()

  const today = new Date()
  const isThisMonth = today.getFullYear() === year && today.getMonth() === month

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1))
  }
  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1))
  }
  function goToday() {
    setCurrentDate(new Date())
  }

  function getJobsForDay(day: number) {
    const dateStr = formatDate(year, month, day)
    return jobs.filter((j) => {
      if (!j.scheduled_start) return false
      const start = j.scheduled_start
      const end = j.scheduled_end || j.scheduled_start
      return dateStr >= start && dateStr <= end
    })
  }

  async function rescheduleJob(jobId: string, targetDate: string) {
    const job = jobs.find((j) => j.id === jobId)
    if (!job || !job.scheduled_start) return

    if (job.scheduled_start === targetDate) return

    const duration = job.scheduled_end ? daysBetween(job.scheduled_start, job.scheduled_end) : 0
    const newStart = targetDate
    const newEnd = duration > 0 ? shiftDate(targetDate, duration) : null

    const originalJobs = jobs
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId ? { ...j, scheduled_start: newStart, scheduled_end: newEnd } : j
      )
    )

    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_start: newStart, scheduled_end: newEnd }),
      })
      if (!res.ok) throw new Error('Failed to reschedule')
      toast(`Rescheduled to ${new Date(targetDate + 'T00:00:00').toLocaleDateString()}`)
      router.refresh()
    } catch (err) {
      console.error(err)
      setJobs(originalJobs)
      toast('Failed to reschedule — reverted', 'error')
    }
  }

  const cells: (number | null)[] = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={goToday}
            className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Today
          </button>
          <button onClick={prevMonth} className="p-1 rounded-md hover:bg-gray-100">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <button onClick={nextMonth} className="p-1 rounded-md hover:bg-gray-100">
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-2">Drag any job to a different day to reschedule.</p>

      <div className="grid grid-cols-7 border border-gray-200 rounded-lg overflow-hidden">
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            className="bg-gray-50 border-b border-gray-200 px-2 py-2 text-xs font-semibold text-gray-500 text-center"
          >
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          const dateStr = day ? formatDate(year, month, day) : null
          const isToday = isThisMonth && day === today.getDate()
          const dayJobs = day ? getJobsForDay(day) : []
          const isDropTarget = dateStr !== null && dragOverDate === dateStr

          return (
            <div
              key={i}
              onDragOver={(e) => {
                if (!dateStr || !draggingId) return
                e.preventDefault()
                if (dragOverDate !== dateStr) setDragOverDate(dateStr)
              }}
              onDragLeave={() => {
                if (dragOverDate === dateStr) setDragOverDate(null)
              }}
              onDrop={(e) => {
                if (!dateStr || !draggingId) return
                e.preventDefault()
                const jobId = e.dataTransfer.getData('text/job-id') || draggingId
                rescheduleJob(jobId, dateStr)
                setDragOverDate(null)
                setDraggingId(null)
              }}
              className={`min-h-[80px] sm:min-h-[100px] border-b border-r border-gray-200 p-1 transition-colors ${
                day ? 'bg-white' : 'bg-gray-50'
              } ${isDropTarget ? 'bg-primary-50 ring-2 ring-primary-400 ring-inset' : ''}`}
            >
              {day && (
                <>
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full ${
                      isToday ? 'bg-primary-600 text-white' : 'text-gray-700'
                    }`}
                  >
                    {day}
                  </span>
                  <div className="mt-0.5 space-y-0.5">
                    {dayJobs.slice(0, 3).map((j) => (
                      <button
                        key={j.id}
                        draggable
                        onDragStart={(e) => {
                          setDraggingId(j.id)
                          e.dataTransfer.setData('text/job-id', j.id)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragEnd={() => {
                          setDraggingId(null)
                          setDragOverDate(null)
                        }}
                        onClick={() => router.push(`/dashboard/jobs/${j.id}`)}
                        className={`block w-full text-left truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight cursor-grab active:cursor-grabbing ${statusColors[j.status]} hover:opacity-80 ${
                          draggingId === j.id ? 'opacity-40' : ''
                        }`}
                      >
                        {j.title}
                      </button>
                    ))}
                    {dayJobs.length > 3 && (
                      <p className="text-[10px] text-gray-400 px-1">+{dayJobs.length - 3} more</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
