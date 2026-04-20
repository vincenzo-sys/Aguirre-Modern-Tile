import Link from 'next/link'
import { Plus, Phone, AlertCircle, Briefcase, Sparkles, ArrowRight, CalendarDays } from 'lucide-react'
import { demoJobs, demoProfile } from '@/lib/demo'
import { shouldUseDemoData } from '@/lib/useDemoFallback'
import type { Job, Profile, QuoteRequest } from '@/lib/supabase/types'
import InstallerJobCard from '@/components/dashboard/InstallerJobCard'

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default async function DashboardHome() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = toDateStr(today)

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = toDateStr(tomorrow)

  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)
  const weekAgoIso = weekAgo.toISOString()

  const useDemo = await shouldUseDemoData()

  if (useDemo) {
    return <OwnerHome todayStr={todayStr} profile={demoProfile} jobs={demoJobs} leads={[]} useDemo />
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <OwnerHome todayStr={todayStr} profile={demoProfile} jobs={demoJobs} leads={[]} useDemo />
  }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  const profile = (profileData as Profile | null) ?? demoProfile
  const isOwner = profile.role === 'owner'

  if (!isOwner) {
    const { data: jobs } = await supabase
      .from('jobs')
      .select('*')
      .eq('assigned_to', user.id)
      .in('status', ['scheduled', 'in_progress', 'waiting_for_materials'])
      .or(`scheduled_start.lte.${tomorrowStr},scheduled_start.is.null`)
      .order('scheduled_start', { ascending: true, nullsFirst: false })

    const jobList = ((jobs ?? []) as Job[]).map((j) => ({
      ...j,
      line_items: j.line_items ?? [],
    }))

    return <InstallerHome profile={profile} jobs={jobList} todayStr={todayStr} tomorrowStr={tomorrowStr} />
  }

  const [jobsResult, leadsResult] = await Promise.all([
    supabase
      .from('jobs')
      .select('*')
      .in('status', ['scheduled', 'in_progress', 'waiting_for_materials'])
      .order('scheduled_start', { ascending: true, nullsFirst: false }),
    supabase
      .from('quote_requests')
      .select('*')
      .order('created_at', { ascending: false }),
  ])

  const jobs = ((jobsResult.data ?? []) as Job[]).map((j) => ({
    ...j,
    line_items: j.line_items ?? [],
  }))
  const leads = (leadsResult.data ?? []) as QuoteRequest[]

  return (
    <OwnerHome
      todayStr={todayStr}
      profile={profile}
      jobs={jobs}
      leads={leads}
      weekAgoIso={weekAgoIso}
    />
  )
}

// =============================================================
// Owner: simple 3-card home
// =============================================================

function OwnerHome({
  todayStr,
  profile,
  jobs,
  leads,
  weekAgoIso,
  useDemo,
}: {
  todayStr: string
  profile: Profile
  jobs: Job[]
  leads: QuoteRequest[]
  weekAgoIso?: string
  useDemo?: boolean
}) {
  const followUps = leads
    .filter(
      (l) =>
        (l.status === 'new' || l.status === 'reviewed') &&
        l.next_follow_up &&
        l.next_follow_up <= todayStr
    )
    .sort((a, b) => (a.next_follow_up ?? '').localeCompare(b.next_follow_up ?? ''))
    .slice(0, 5)

  const activeJobs = jobs
    .filter((j) => j.status === 'in_progress' || j.status === 'scheduled')
    .slice(0, 5)

  const newThisWeek = weekAgoIso
    ? leads.filter((l) => l.created_at >= weekAgoIso && l.status === 'new').length
    : leads.filter((l) => l.status === 'new').length

  const firstName = profile.full_name?.split(' ')[0] || ''

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {firstName ? `Hi, ${firstName}` : 'Dashboard'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <Link
          href="/dashboard/leads/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Lead
        </Link>
      </div>

      {useDemo && (
        <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 p-3">
          <p className="text-sm text-amber-800">
            <strong>Demo Mode</strong> — Viewing sample data.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Follow up today */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-600">
              <AlertCircle className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Follow up today</h2>
            {followUps.length > 0 && (
              <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700">
                {followUps.length}
              </span>
            )}
          </div>

          {followUps.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing due today. Nice.</p>
          ) : (
            <ul className="space-y-3">
              {followUps.map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={`/dashboard/leads/${lead.id}`}
                    className="block p-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {lead.client_name}
                        </p>
                        <p className="text-xs text-gray-500 capitalize">{lead.project_type}</p>
                      </div>
                      {lead.client_phone && (
                        <a
                          href={`tel:${lead.client_phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-primary-700 bg-primary-50 rounded-md hover:bg-primary-100"
                        >
                          <Phone className="w-3 h-3" />
                          Call
                        </a>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/dashboard/leads"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline mt-3"
          >
            View all leads <ArrowRight className="w-3 h-3" />
          </Link>
        </section>

        {/* Active jobs */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <Briefcase className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Active jobs</h2>
            <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
              {jobs.length}
            </span>
          </div>

          {activeJobs.length === 0 ? (
            <p className="text-sm text-gray-500">No active jobs.</p>
          ) : (
            <ul className="space-y-2">
              {activeJobs.map((job) => (
                <li key={job.id}>
                  <Link
                    href={`/dashboard/jobs/${job.id}`}
                    className="block p-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200"
                  >
                    <p className="text-sm font-medium text-gray-900 truncate">{job.title}</p>
                    <p className="text-xs text-gray-500 capitalize">
                      {job.status.replace('_', ' ')}
                      {job.scheduled_start &&
                        ` · ${new Date(job.scheduled_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/dashboard/jobs"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline mt-3"
          >
            View board <ArrowRight className="w-3 h-3" />
          </Link>
        </section>

        {/* New this week */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">New this week</h2>
            <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">
              {newThisWeek}
            </span>
          </div>

          <p className="text-sm text-gray-600 mb-4">
            {newThisWeek === 0
              ? 'No new leads in the last 7 days.'
              : `${newThisWeek} fresh lead${newThisWeek === 1 ? '' : 's'} to review.`}
          </p>

          <Link
            href="/dashboard/leads"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-sm font-medium text-gray-700 rounded-md"
          >
            Review new leads <ArrowRight className="w-3 h-3" />
          </Link>
        </section>
      </div>
    </div>
  )
}

// =============================================================
// Installer: today + tomorrow focused
// =============================================================

function InstallerHome({
  profile,
  jobs,
  todayStr,
  tomorrowStr,
}: {
  profile: Profile
  jobs: Job[]
  todayStr: string
  tomorrowStr: string
}) {
  const firstName = profile.full_name?.split(' ')[0] || ''

  function isOnDay(job: Job, dayStr: string): boolean {
    if (!job.scheduled_start) return false
    const end = job.scheduled_end ?? job.scheduled_start
    return job.scheduled_start <= dayStr && end >= dayStr
  }

  const todayJobs = jobs.filter((j) => isOnDay(j, todayStr))
  const tomorrowJobs = jobs.filter((j) => isOnDay(j, tomorrowStr) && !isOnDay(j, todayStr))
  const otherJobs = jobs.filter(
    (j) => !isOnDay(j, todayStr) && !isOnDay(j, tomorrowStr)
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {firstName ? `Hi, ${firstName}` : 'Today'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {/* Today */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Today
        </h2>
        {todayJobs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No jobs scheduled for today.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {todayJobs.map((job) => (
              <InstallerJobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </section>

      {/* Tomorrow */}
      {tomorrowJobs.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Tomorrow
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tomorrowJobs.map((job) => (
              <InstallerJobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}

      {/* Later this week */}
      {otherJobs.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Later this week
          </h2>
          <ul className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {otherJobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/dashboard/jobs/${job.id}`}
                  className="block px-4 py-3 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{job.title}</p>
                      <p className="text-xs text-gray-500">
                        {job.scheduled_start &&
                          new Date(job.scheduled_start + 'T00:00:00').toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400 capitalize">
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
