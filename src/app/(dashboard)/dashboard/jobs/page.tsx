import { Suspense } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { demoJobs, demoProfile, demoTeamMembers } from '@/lib/demo'
import { shouldUseDemoData } from '@/lib/useDemoFallback'
import type { Job, Profile, JobWithAssignee, JobStatus } from '@/lib/supabase/types'
import MetricsCards from '@/components/dashboard/MetricsCards'
import ViewSwitcher from '@/components/dashboard/ViewSwitcher'
import JobsFilterBar, { filterJobs } from '@/components/dashboard/JobsFilterBar'
import JobListView from '@/components/dashboard/JobListView'
import KanbanBoard from '@/components/dashboard/KanbanBoard'
import CalendarView from '@/components/dashboard/CalendarView'
import TimelineView from '@/components/dashboard/TimelineView'

const statusTabMap: Record<string, JobStatus[]> = {
  leads: ['lead'],
  quoted: ['quoted'],
  scheduled: ['scheduled'],
  active: ['in_progress', 'waiting_for_materials'],
  completed: ['completed'],
  paid: ['paid'],
  cancelled: ['cancelled'],
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string; type?: string; q?: string }>
}) {
  let isOwner = true
  let profile: Profile = demoProfile
  let jobList: JobWithAssignee[] = []
  let team: Profile[] = []

  const useDemo = await shouldUseDemoData()

  if (useDemo) {
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

  const { view: viewParam, status: statusFilter, type: typeFilter, q: searchFilter } = await searchParams
  const view = viewParam || 'list'

  // Apply filters
  const filtered = filterJobs(
    jobList,
    statusFilter || 'all',
    typeFilter || '',
    searchFilter || '',
  ) as JobWithAssignee[]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filtered.length} of {jobList.length} job{jobList.length !== 1 ? 's' : ''}
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

      <div className="mb-6">
        <MetricsCards jobs={jobList} />
      </div>

      <Suspense fallback={null}>
        <JobsFilterBar jobCount={jobList.length} />
      </Suspense>

      <div className="mb-4">
        <Suspense fallback={null}>
          <ViewSwitcher />
        </Suspense>
      </div>

      {view === 'kanban' && (
        <KanbanBoard initialJobs={filtered} isOwner={isOwner} profile={profile} />
      )}
      {view === 'calendar' && <CalendarView jobs={filtered} />}
      {view === 'timeline' && <TimelineView jobs={filtered} team={team} />}
      {(view === 'list' || !['kanban', 'calendar', 'timeline'].includes(view)) && (
        <JobListView jobs={filtered} isOwner={isOwner} profile={profile} />
      )}
    </div>
  )
}
