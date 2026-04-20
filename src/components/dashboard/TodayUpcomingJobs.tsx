import Link from 'next/link'
import { MapPin, User as UserIcon, Clock, Calendar as CalendarIcon, CalendarDays } from 'lucide-react'
import type { JobStatus, JobWithAssignee } from '@/lib/supabase/types'

const statusStyle: Record<JobStatus, string> = {
  lead: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  quoted: 'bg-blue-100 text-blue-800 border-blue-200',
  scheduled: 'bg-purple-100 text-purple-800 border-purple-200',
  in_progress: 'bg-orange-100 text-orange-800 border-orange-200',
  waiting_for_materials: 'bg-amber-100 text-amber-800 border-amber-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatRange(start: string | null, end: string | null): string {
  if (!start) return 'Unscheduled'
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  if (!end || end === start) return s
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  return `${s} → ${e}`
}

function JobCard({ job }: { job: JobWithAssignee }) {
  return (
    <Link
      href={`/dashboard/jobs/${job.id}`}
      className="block bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:border-primary-300 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-gray-900 truncate">{job.title}</h3>
          <p className="text-sm text-gray-500 truncate">{job.client_name}</p>
        </div>
        <span
          className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border capitalize whitespace-nowrap ${statusStyle[job.status]}`}
        >
          {job.status.replace('_', ' ')}
        </span>
      </div>

      <div className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2 text-gray-600">
          <CalendarIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span>{formatRange(job.scheduled_start, job.scheduled_end)}</span>
        </div>
        {job.client_address && (
          <div className="flex items-center gap-2 text-gray-600">
            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="truncate">{job.client_address}</span>
          </div>
        )}
        {job.assignee && (
          <div className="flex items-center gap-2 text-gray-600">
            <UserIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span>{job.assignee.full_name}</span>
          </div>
        )}
        {job.estimated_cost && (
          <div className="text-xs text-gray-500">
            Est. ${Number(job.estimated_cost).toLocaleString()}
          </div>
        )}
      </div>
    </Link>
  )
}

export default function TodayUpcomingJobs({ jobs }: { jobs: JobWithAssignee[] }) {
  const today = toDateStr(new Date())
  const twoWeeks = new Date()
  twoWeeks.setDate(twoWeeks.getDate() + 14)
  const twoWeeksStr = toDateStr(twoWeeks)

  function isToday(job: JobWithAssignee): boolean {
    if (!job.scheduled_start) return false
    const end = job.scheduled_end ?? job.scheduled_start
    return job.scheduled_start <= today && end >= today
  }

  const terminal: JobStatus[] = ['completed', 'paid', 'cancelled']

  const todayJobs = jobs
    .filter((j) => isToday(j) && !terminal.includes(j.status))
    .sort((a, b) =>
      (a.scheduled_start ?? '').localeCompare(b.scheduled_start ?? '')
    )

  const upcomingJobs = jobs
    .filter((j) => {
      if (terminal.includes(j.status)) return false
      if (!j.scheduled_start) return false
      if (isToday(j)) return false
      return j.scheduled_start > today && j.scheduled_start <= twoWeeksStr
    })
    .sort((a, b) =>
      (a.scheduled_start ?? '').localeCompare(b.scheduled_start ?? '')
    )

  const needsSchedule = jobs.filter(
    (j) => !terminal.includes(j.status) && !j.scheduled_start
  )

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Today ({todayJobs.length})
        </h2>
        {todayJobs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-500">No jobs scheduled for today.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {todayJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4" />
          Upcoming (next 14 days) ({upcomingJobs.length})
        </h2>
        {upcomingJobs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-500">Nothing scheduled in the next two weeks.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {upcomingJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </section>

      {needsSchedule.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Needs scheduling ({needsSchedule.length})
          </h2>
          <ul className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {needsSchedule.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/dashboard/jobs/${job.id}`}
                  className="block px-4 py-3 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{job.title}</p>
                      <p className="text-xs text-gray-500 truncate">{job.client_name}</p>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize whitespace-nowrap ${statusStyle[job.status]}`}
                    >
                      {job.status.replace('_', ' ')}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
