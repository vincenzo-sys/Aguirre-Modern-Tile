'use client'

import { useRouter } from 'next/navigation'
import type { JobWithAssignee, JobStatus, Profile } from '@/lib/supabase/types'

const statusColors: Record<JobStatus, string> = {
  lead: 'bg-yellow-300',
  quoted: 'bg-blue-300',
  scheduled: 'bg-purple-300',
  in_progress: 'bg-orange-300',
  completed: 'bg-green-300',
  paid: 'bg-emerald-300',
  cancelled: 'bg-gray-300',
}

const PX_PER_DAY = 40

function daysBetween(a: string, b: string) {
  const d1 = new Date(a + 'T00:00:00')
  const d2 = new Date(b + 'T00:00:00')
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function TimelineView({ jobs, team }: { jobs: JobWithAssignee[]; team: Profile[] }) {
  const router = useRouter()

  // Build date range: current month with 1 week padding on each side
  const now = new Date()
  const rangeStart = new Date(now.getFullYear(), now.getMonth(), 1)
  rangeStart.setDate(rangeStart.getDate() - 7)
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  rangeEnd.setDate(rangeEnd.getDate() + 7)

  const totalDays = daysBetween(formatDate(rangeStart), formatDate(rangeEnd)) + 1
  const startStr = formatDate(rangeStart)

  // Generate date headers
  const dates: Date[] = []
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(rangeStart)
    d.setDate(d.getDate() + i)
    dates.push(d)
  }

  // Today marker position
  const todayStr = formatDate(now)
  const todayOffset = daysBetween(startStr, todayStr)

  // Group jobs by assignee
  type Group = { name: string; jobs: JobWithAssignee[] }
  const groups: Group[] = []

  for (const member of team) {
    groups.push({
      name: member.full_name,
      jobs: jobs.filter((j) => j.assigned_to === member.id && j.scheduled_start),
    })
  }

  const unassigned = jobs.filter((j) => !j.assigned_to && j.scheduled_start)
  if (unassigned.length > 0) {
    groups.push({ name: 'Unassigned', jobs: unassigned })
  }

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
      <div style={{ minWidth: totalDays * PX_PER_DAY + 160 }} className="relative">
        {/* Header row with dates */}
        <div className="flex border-b border-gray-200 sticky top-0 bg-white z-10">
          <div className="w-40 shrink-0 px-3 py-2 bg-gray-50 border-r border-gray-200 text-xs font-semibold text-gray-500">
            Team
          </div>
          <div className="flex">
            {dates.map((d, i) => {
              const isToday = formatDate(d) === todayStr
              const isWeekend = d.getDay() === 0 || d.getDay() === 6
              return (
                <div
                  key={i}
                  style={{ width: PX_PER_DAY }}
                  className={`shrink-0 px-0.5 py-2 text-center border-r border-gray-100 ${
                    isToday ? 'bg-primary-50' : isWeekend ? 'bg-gray-50' : ''
                  }`}
                >
                  <p className="text-[10px] text-gray-400">
                    {d.toLocaleDateString('en-US', { weekday: 'narrow' })}
                  </p>
                  <p className={`text-xs font-medium ${isToday ? 'text-primary-600' : 'text-gray-600'}`}>
                    {d.getDate()}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Groups */}
        {groups.map((group) => {
          const rowCount = Math.max(group.jobs.length, 1)
          return (
            <div key={group.name} className="flex border-b border-gray-200">
              <div className="w-40 shrink-0 px-3 py-3 bg-gray-50 border-r border-gray-200">
                <p className="text-sm font-medium text-gray-700 truncate">{group.name}</p>
                <p className="text-xs text-gray-400">{group.jobs.length} jobs</p>
              </div>
              <div className="relative flex-1" style={{ minHeight: rowCount * 36 + 8 }}>
                {/* Today marker */}
                {todayOffset >= 0 && todayOffset < totalDays && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-primary-400 z-[5]"
                    style={{ left: todayOffset * PX_PER_DAY + PX_PER_DAY / 2 }}
                  />
                )}
                {group.jobs.map((job, idx) => {
                  const jobStart = daysBetween(startStr, job.scheduled_start!)
                  const jobEnd = job.scheduled_end
                    ? daysBetween(startStr, job.scheduled_end)
                    : jobStart + (job.estimated_days ?? 1) - 1
                  const left = Math.max(0, jobStart) * PX_PER_DAY
                  const width = Math.max(1, jobEnd - Math.max(0, jobStart) + 1) * PX_PER_DAY

                  return (
                    <button
                      key={job.id}
                      onClick={() => router.push(`/dashboard/jobs/${job.id}`)}
                      title={`#${job.job_number} ${job.title}`}
                      className={`absolute h-7 rounded ${statusColors[job.status]} hover:opacity-80 text-xs font-medium text-gray-900 px-2 truncate flex items-center`}
                      style={{ left, width: Math.max(width, PX_PER_DAY), top: idx * 36 + 4 }}
                    >
                      #{job.job_number} {job.title}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
