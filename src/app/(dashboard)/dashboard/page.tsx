import { Suspense } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { isDemoMode, demoJobs, demoProfile, demoTeamMembers } from '@/lib/demo'
import type { Job, Profile, JobWithAssignee } from '@/lib/supabase/types'
import MetricsCards from '@/components/dashboard/MetricsCards'
import ViewSwitcher from '@/components/dashboard/ViewSwitcher'
import JobListView from '@/components/dashboard/JobListView'
import KanbanBoard from '@/components/dashboard/KanbanBoard'
import CalendarView from '@/components/dashboard/CalendarView'
import TimelineView from '@/components/dashboard/TimelineView'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  let isOwner = true
  let profile: Profile = demoProfile
  let jobList: JobWithAssignee[] = []
  let team: Profile[] = []

  if (isDemoMode) {
    jobList = demoJobs
    team = demoTeamMembers
  } else {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user!.id)
      .single()

    profile = profileData as Profile
    isOwner = profile.role === 'owner'

    const { data: jobs } = await supabase
      .from('jobs')
      .select('*')
      .order('scheduled_start', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    const rawJobs = (jobs ?? []) as Job[]

    const assigneeIds = Array.from(new Set(rawJobs.map((j) => j.assigned_to).filter(Boolean))) as string[]
    let assigneeMap: Record<string, Profile> = {}

    if (assigneeIds.length > 0) {
      const { data: assignees } = await supabase
        .from('profiles')
        .select('*')
        .in('id', assigneeIds)
      for (const a of (assignees ?? []) as Profile[]) {
        assigneeMap[a.id] = a
      }
    }

    jobList = rawJobs.map((job) => ({
      ...job,
      assignee: job.assigned_to ? assigneeMap[job.assigned_to] ?? null : null,
    }))

    const { data: teamData } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_active', true)
      .order('full_name')
    team = (teamData ?? []) as Profile[]
  }

  const { view: viewParam } = await searchParams
  const view = viewParam || 'list'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-500 mt-1">
            {jobList.length} {jobList.length === 1 ? 'job' : 'jobs'} total
          </p>
        </div>
        {isOwner && (
          <Link
            href="/dashboard/jobs/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Job
          </Link>
        )}
      </div>

      {isDemoMode && (
        <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 p-3">
          <p className="text-sm text-amber-800">
            <strong>Demo Mode</strong> — Viewing sample data. Connect Supabase to use real data.
          </p>
        </div>
      )}

      <div className="mb-6">
        <MetricsCards jobs={jobList} />
      </div>

      <div className="mb-4">
        <Suspense fallback={null}>
          <ViewSwitcher />
        </Suspense>
      </div>

      {view === 'kanban' && (
        <KanbanBoard initialJobs={jobList} isOwner={isOwner} profile={profile} />
      )}
      {view === 'calendar' && <CalendarView jobs={jobList} />}
      {view === 'timeline' && <TimelineView jobs={jobList} team={team} />}
      {(view === 'list' || !['kanban', 'calendar', 'timeline'].includes(view)) && (
        <JobListView jobs={jobList} isOwner={isOwner} profile={profile} />
      )}
    </div>
  )
}
