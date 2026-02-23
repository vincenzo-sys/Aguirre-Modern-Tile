'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { JobWithAssignee, JobStatus } from '@/lib/supabase/types'

const statusColors: Record<JobStatus, string> = {
  lead: 'bg-yellow-200 text-yellow-900',
  quoted: 'bg-blue-200 text-blue-900',
  scheduled: 'bg-purple-200 text-purple-900',
  in_progress: 'bg-orange-200 text-orange-900',
  completed: 'bg-green-200 text-green-900',
  paid: 'bg-emerald-200 text-emerald-900',
  cancelled: 'bg-gray-200 text-gray-900',
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarView({ jobs }: { jobs: JobWithAssignee[] }) {
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(new Date())

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
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return jobs.filter((j) => {
      if (!j.scheduled_start) return false
      const start = j.scheduled_start
      const end = j.scheduled_end || j.scheduled_start
      return dateStr >= start && dateStr <= end
    })
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

      <div className="grid grid-cols-7 border border-gray-200 rounded-lg overflow-hidden">
        {DAY_NAMES.map((d) => (
          <div key={d} className="bg-gray-50 border-b border-gray-200 px-2 py-2 text-xs font-semibold text-gray-500 text-center">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          const isToday = isThisMonth && day === today.getDate()
          const dayJobs = day ? getJobsForDay(day) : []
          return (
            <div
              key={i}
              className={`min-h-[80px] sm:min-h-[100px] border-b border-r border-gray-200 p-1 ${
                day ? 'bg-white' : 'bg-gray-50'
              }`}
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
                        onClick={() => router.push(`/dashboard/jobs/${j.id}`)}
                        className={`block w-full text-left truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight ${statusColors[j.status]} hover:opacity-80`}
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
