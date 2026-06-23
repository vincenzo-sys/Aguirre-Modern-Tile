'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, UserCircle2, Plus, X } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { JobWithAssignee, JobStatus, Profile, CrewMember, CrewAssignment } from '@/lib/supabase/types'

const statusColors: Record<JobStatus, string> = {
  lead: 'bg-yellow-200 text-yellow-900',
  quoted: 'bg-blue-200 text-blue-900',
  estimate_revised: 'bg-indigo-200 text-indigo-900',
  accepted_not_scheduled: 'bg-teal-200 text-teal-900',
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
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

const UNASSIGNED_ID = '__unassigned__'

export default function CrewWeekView({
  jobs,
  team,
  crewMembers = [],
  assignments = [],
}: {
  jobs: JobWithAssignee[]
  team: Profile[]
  crewMembers?: CrewMember[]
  assignments?: CrewAssignment[]
}) {
  const router = useRouter()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  // Local mirror of assignments so the grid updates instantly on assign/unassign.
  const [localAssignments, setLocalAssignments] = useState<CrewAssignment[]>(assignments)
  // Which cell (crew::day) has its job picker open.
  const [openPicker, setOpenPicker] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  )
  const weekStartStr = toDateStr(weekStart)
  const weekEndStr = toDateStr(addDays(weekStart, 6))
  const today = toDateStr(new Date())

  // New model: explicit crew assignments. Falls back to the legacy profile /
  // assigned_to rendering when there are no crew_members yet (e.g. demo mode).
  const useCrewModel = crewMembers.length > 0

  const jobsById = useMemo(() => {
    const map: Record<string, JobWithAssignee> = {}
    for (const j of jobs) map[j.id] = j
    return map
  }, [jobs])

  // -------- Legacy (profile-based) path --------
  const scheduledJobs = useMemo(
    () =>
      jobs.filter((j) => {
        if (!j.scheduled_start) return false
        const end = j.scheduled_end || j.scheduled_start
        return j.scheduled_start <= weekEndStr && end >= weekStartStr
      }),
    [jobs, weekStartStr, weekEndStr]
  )

  const legacyRowIds = useMemo(() => {
    const assigneesUsed = new Set<string>()
    let hasUnassigned = false
    for (const j of scheduledJobs) {
      if (j.assigned_to) assigneesUsed.add(j.assigned_to)
      else hasUnassigned = true
    }
    const active = team.filter((t) => assigneesUsed.has(t.id)).map((t) => t.id)
    const teamIds = team.filter((t) => t.is_active).map((t) => t.id).filter((id) => !active.includes(id))
    const rows = [...active, ...teamIds]
    if (hasUnassigned) rows.push(UNASSIGNED_ID)
    return rows
  }, [scheduledJobs, team])

  const teamById = useMemo(() => {
    const map: Record<string, Profile> = {}
    for (const t of team) map[t.id] = t
    return map
  }, [team])

  function legacyJobsForCell(rowId: string, dayStr: string): JobWithAssignee[] {
    return scheduledJobs.filter((j) => {
      const end = j.scheduled_end || j.scheduled_start!
      const inRange = j.scheduled_start! <= dayStr && end >= dayStr
      if (!inRange) return false
      if (rowId === UNASSIGNED_ID) return !j.assigned_to
      return j.assigned_to === rowId
    })
  }

  // -------- Crew-assignment path --------
  // (crewId|dayStr) -> assignments in that cell
  const assignmentsByCell = useMemo(() => {
    const map = new Map<string, CrewAssignment[]>()
    for (const a of localAssignments) {
      const key = `${a.crew_member_id}|${a.work_date}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(a)
    }
    return map
  }, [localAssignments])

  const activeCrew = useMemo(() => crewMembers.filter((c) => c.is_active), [crewMembers])

  // Candidate jobs for the assign picker on a given day: jobs scheduled that
  // day first, then any other operational job (so off-schedule help can be
  // logged too).
  function candidateJobs(dayStr: string): JobWithAssignee[] {
    const overlapping = jobs.filter((j) => {
      if (!j.scheduled_start) return false
      const end = j.scheduled_end || j.scheduled_start
      return j.scheduled_start <= dayStr && end >= dayStr
    })
    const overlappingIds = new Set(overlapping.map((j) => j.id))
    const rest = jobs.filter((j) => !overlappingIds.has(j.id))
    return [...overlapping, ...rest]
  }

  async function assign(crewId: string, dayStr: string, jobId: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/crew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crew_member_id: crewId, work_date: dayStr }),
      })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      const created: CrewAssignment | undefined = data.assignments?.[0]
      setLocalAssignments((prev) => {
        // Avoid dupes if the row already existed (upsert ignoreDuplicates).
        const exists = prev.some(
          (a) => a.crew_member_id === crewId && a.work_date === dayStr && a.job_id === jobId
        )
        if (exists) return prev
        return [
          ...prev,
          created ?? {
            id: `tmp-${crewId}-${dayStr}-${jobId}`,
            job_id: jobId,
            crew_member_id: crewId,
            work_date: dayStr,
            created_by: null,
            created_at: new Date().toISOString(),
          },
        ]
      })
      setOpenPicker(null)
      toast('Crew assigned')
      router.refresh()
    } catch {
      toast('Could not assign crew', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function unassign(a: CrewAssignment) {
    const previous = localAssignments
    setLocalAssignments((prev) => prev.filter((x) => x.id !== a.id))
    try {
      const res = await fetch(
        `/api/jobs/${a.job_id}/crew?crew_member_id=${a.crew_member_id}&work_date=${a.work_date}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('Failed')
      toast('Removed')
      router.refresh()
    } catch {
      setLocalAssignments(previous)
      toast('Could not remove', 'error')
    }
  }

  const rowIds = useCrewModel ? activeCrew.map((c) => c.id) : legacyRowIds
  const crewById = useMemo(() => {
    const map: Record<string, CrewMember> = {}
    for (const c of crewMembers) map[c.id] = c
    return map
  }, [crewMembers])

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
                  {useCrewModel ? 'No active crew. Add crew in Settings → Crew.' : 'No scheduled jobs this week.'}
                </td>
              </tr>
            )}
            {rowIds.map((rowId) => {
              const crew = useCrewModel ? crewById[rowId] : null
              const member = !useCrewModel && rowId !== UNASSIGNED_ID ? teamById[rowId] : null
              const name = useCrewModel
                ? crew?.nickname || crew?.full_name || 'Crew'
                : member
                ? member.full_name
                : 'Unassigned'

              return (
                <tr key={rowId} className="border-t border-gray-200">
                  <td className="px-3 py-2 text-sm font-medium text-gray-900 sticky left-0 bg-white z-10 border-r border-gray-200">
                    <div className="flex items-center gap-2">
                      <UserCircle2 className={`w-5 h-5 ${!useCrewModel && rowId === UNASSIGNED_ID ? 'text-gray-400' : 'text-primary-500'}`} />
                      <span className={!useCrewModel && rowId === UNASSIGNED_ID ? 'text-gray-500 italic' : ''}>{name}</span>
                    </div>
                  </td>
                  {weekDays.map((d) => {
                    const dayStr = toDateStr(d)
                    const isToday = dayStr === today
                    const cellKey = `${rowId}|${dayStr}`

                    if (!useCrewModel) {
                      const cellJobs = legacyJobsForCell(rowId, dayStr)
                      return (
                        <td
                          key={dayStr}
                          className={`align-top border-l border-gray-200 px-1 py-1 min-w-[110px] ${isToday ? 'bg-primary-50/30' : ''}`}
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
                    }

                    const cellAssignments = assignmentsByCell.get(cellKey) ?? []
                    const isPickerOpen = openPicker === cellKey
                    return (
                      <td
                        key={dayStr}
                        className={`align-top border-l border-gray-200 px-1 py-1 min-w-[120px] relative ${isToday ? 'bg-primary-50/30' : ''}`}
                      >
                        <div className="space-y-1">
                          {cellAssignments.map((a) => {
                            const job = jobsById[a.job_id]
                            const status = job?.status ?? 'scheduled'
                            return (
                              <div
                                key={a.id}
                                className={`group flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium leading-tight ${statusColors[status]}`}
                                title={job?.title ?? 'Job'}
                              >
                                <button
                                  onClick={() => job && router.push(`/dashboard/jobs/${job.id}`)}
                                  className="min-w-0 flex-1 text-left truncate hover:opacity-80"
                                >
                                  {job?.title ?? 'Job'}
                                </button>
                                <button
                                  onClick={() => unassign(a)}
                                  aria-label="Remove assignment"
                                  className="opacity-50 hover:opacity-100"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            )
                          })}

                          <button
                            onClick={() => setOpenPicker(isPickerOpen ? null : cellKey)}
                            className="w-full flex items-center justify-center gap-1 rounded border border-dashed border-gray-300 px-1.5 py-1 text-[11px] text-gray-400 hover:text-primary-600 hover:border-primary-300 min-h-[28px]"
                            aria-label="Assign a job"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {isPickerOpen && (
                          <div className="absolute z-20 mt-1 left-1 right-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                            {candidateJobs(dayStr).length === 0 ? (
                              <p className="px-2 py-2 text-[11px] text-gray-400">No jobs</p>
                            ) : (
                              candidateJobs(dayStr).map((j) => (
                                <button
                                  key={j.id}
                                  disabled={busy}
                                  onClick={() => assign(rowId, dayStr, j.id)}
                                  className="block w-full text-left truncate px-2 py-1.5 text-[11px] text-gray-700 hover:bg-primary-50 disabled:opacity-50"
                                  title={j.title}
                                >
                                  {j.title}
                                </button>
                              ))
                            )}
                          </div>
                        )}
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
