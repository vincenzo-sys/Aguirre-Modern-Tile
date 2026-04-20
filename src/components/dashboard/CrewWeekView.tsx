'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, UserCircle2 } from 'lucide-react'
import type { JobWithAssignee, JobStatus, Profile } from '@/lib/supabase/types'

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

function startOfWeek(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  copy.setDate(copy.getDate() - copy.getDay())
  return copy
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + days)
  return copy
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

const UNASSIGNED_ID = '__unassigned__'

export default function CrewWeekView({
  jobs,
  team,
}: {
  jobs: JobWithAssignee[]
  team: Profile[]
}) {
  const router = useRouter()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  )
  const weekStartStr = toDateStr(weekStart)
  const weekEndStr = toDateStr(addDays(weekStart, 6))

  const scheduledJobs = useMemo(
    () =>
      jobs.filter((j) => {
        if (!j.scheduled_start) return false
        const end = j.scheduled_end || j.scheduled_start
        return j.scheduled_start <= weekEndStr && end >= weekStartStr
      }),
    [jobs, weekStartStr, weekEndStr]
  )

  // Build rows: one per team member used this week, plus Unassigned at the bottom if needed
  const rowIds = useMemo(() => {
    const assigneesUsed = new Set<string>()
    let hasUnassigned = false
    for (const j of scheduledJobs) {
      if (j.assigned_to) assigneesUsed.add(j.assigned_to)
      else hasUnassigned = true
    }

    const active = team.filter((t) => assigneesUsed.has(t.id)).map((t) => t.id)
    const teamIds = team
      .filter((t) => t.is_active)
      .map((t) => t.id)
      .filter((id) => !active.includes(id))

    const rows = [...active, ...teamIds]
    if (hasUnassigned) rows.push(UNASSIGNED_ID)
    return rows
  }, [scheduledJobs, team])

  const teamById = useMemo(() => {
    const map: Record<string, Profile> = {}
    for (const t of team) map[t.id] = t
    return map
  }, [team])

  function jobsForCell(rowId: string, dayStr: string): JobWithAssignee[] {
    return scheduledJobs.filter((j) => {
      const end = j.scheduled_end || j.scheduled_start!
      const inRange = j.scheduled_start! <= dayStr && end >= dayStr
      if (!inRange) return false
      if (rowId === UNASSIGNED_ID) return !j.assigned_to
      return j.assigned_to === rowId
    })
  }

  const today = toDateStr(new Date())

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Week of {weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            This Week
          </button>
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="p-1 rounded-md hover:bg-gray-100"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="p-1 rounded-md hover:bg-gray-100"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border border-gray-200 rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2 w-40 sticky left-0 bg-gray-50 z-10">
                Crew
              </th>
              {weekDays.map((d) => {
                const dayStr = toDateStr(d)
                const isToday = dayStr === today
                return (
                  <th
                    key={dayStr}
                    className={`text-xs font-semibold px-2 py-2 border-l border-gray-200 ${
                      isToday ? 'bg-primary-50 text-primary-700' : 'text-gray-500'
                    }`}
                  >
                    <div>{DAY_NAMES[d.getDay()]}</div>
                    <div className="text-sm font-bold mt-0.5">{d.getDate()}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rowIds.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-sm text-gray-500">
                  No scheduled jobs this week.
                </td>
              </tr>
            )}
            {rowIds.map((rowId) => {
              const member = rowId === UNASSIGNED_ID ? null : teamById[rowId]
              const name = member ? member.full_name : 'Unassigned'

              return (
                <tr key={rowId} className="border-t border-gray-200">
                  <td className="px-3 py-2 text-sm font-medium text-gray-900 sticky left-0 bg-white z-10 border-r border-gray-200">
                    <div className="flex items-center gap-2">
                      <UserCircle2 className={`w-5 h-5 ${rowId === UNASSIGNED_ID ? 'text-gray-400' : 'text-primary-500'}`} />
                      <span className={rowId === UNASSIGNED_ID ? 'text-gray-500 italic' : ''}>{name}</span>
                    </div>
                  </td>
                  {weekDays.map((d) => {
                    const dayStr = toDateStr(d)
                    const cellJobs = jobsForCell(rowId, dayStr)
                    const isToday = dayStr === today
                    return (
                      <td
                        key={dayStr}
                        className={`align-top border-l border-gray-200 px-1 py-1 min-w-[110px] ${
                          isToday ? 'bg-primary-50/30' : ''
                        }`}
                      >
                        <div className="space-y-1">
                          {cellJobs.map((j) => (
                            <button
                              key={j.id}
                              onClick={() => router.push(`/dashboard/jobs/${j.id}`)}
                              className={`block w-full text-left truncate rounded px-1.5 py-1 text-[11px] font-medium leading-tight ${statusColors[j.status]} hover:opacity-80`}
                              title={j.title}
                            >
                              {j.title}
                            </button>
                          ))}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
