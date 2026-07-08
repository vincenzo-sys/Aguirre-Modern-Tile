import { Suspense } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { demoJobs, demoProfile, demoTeamMembers } from '@/lib/demo'
import { shouldUseDemoData } from '@/lib/useDemoFallback'
import type { Job, Profile, JobWithAssignee, JobStatus, CrewMember, CrewAssignment } from '@/lib/supabase/types'
import ViewSwitcher from '@/components/dashboard/ViewSwitcher'
import JobsFilterBar from '@/components/dashboard/JobsFilterBar'
import { filterJobs } from '@/lib/filterJobs'
import JobListView from '@/components/dashboard/JobListView'
import KanbanBoard from '@/components/dashboard/KanbanBoard'
import CalendarView from '@/components/dashboard/CalendarView'
import CrewWeekView from '@/components/dashboard/CrewWeekView'
import TimelineView from '@/components/dashboard/TimelineView'
import TodayUpcomingJobs from '@/components/dashboard/TodayUpcomingJobs'

// Statuses considered "operational" — past the sales pipeline. The Jobs page
// only shows these. Lead-stage statuses (lead/quoted/estimate_revised) live
// on the Leads page now since they're still active sales work.
const OPERATIONAL_STATUSES: JobStatus[] = [
  'accepted_not_scheduled',
  'scheduled',
  'in_progress',
  'waiting_for_materials',
  'completed',
  'paid',
  'cancelled',
]

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string; type?: string; q?: string }>
}) {
  let isOwner = true
  let profile: Profile = demoProfile
  let jobList: JobWithAssignee[] = []
  let team: Profile[] = []
  let crewMembers: CrewMember[] = []
  let crewAssignments: CrewAssignment[] = []

  const useDemo = await shouldUseDemoData()

  if (useDemo) {
    jobList = demoJobs
    team = demoTeamMembers
  } else {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      // Fallback to demo if auth failed between middleware and page render
      jobList = demoJobs
      team = demoTeamMembers
    } else {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileData) {
      profile = profileData as Profile
      isOwner = profile.role === 'owner'
    }

    let jobsQuery = supabase
      .from('jobs')
      .select('*')
      .in('status', OPERATIONAL_STATUSES)
      .order('scheduled_start', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    // Non-owners only see their assigned jobs
    if (!isOwner) {
      jobsQuery = jobsQuery.eq('assigned_to', user.id)
    }

    const { data: jobs } = await jobsQuery

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
      line_items: job.line_items ?? [],
      assignee: job.assigned_to ? assigneeMap[job.assigned_to] ?? null : null,
    }))

    const { data: teamData } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_active', true)
      .order('full_name')
    team = (teamData ?? []) as Profile[]

    // Crew roster + assignments power the crew week grid. Assignments are
    // small (job_id, crew_member_id, work_date); the grid filters by week
    // client-side as you navigate.
    const { data: crewData } = await supabase
      .from('crew_members')
      .select('*')
      .eq('is_active', true)
      .order('full_name')
    crewMembers = (crewData ?? []) as CrewMember[]

    const { data: assignData } = await supabase
      .from('crew_assignments')
      .select('*')
    crewAssignments = (assignData ?? []) as CrewAssignment[]
    }
  }

  const { view: viewParam, status: statusFilter, type: typeFilter, q: searchFilter } = await searchParams
  const view = viewParam || 'cards'

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
          <h1 className="text-2xl font-bold text-gray-900">
            {isOwner ? 'Installs' : 'My installs'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isOwner
              ? `${filtered.length} of ${jobList.length} job${jobList.length !== 1 ? 's' : ''}`
              : `${jobList.length} assigned to you`}
          </p>
        </div>
        {isOwner && (
          <Link
            href="/dashboard/leads/board/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Job
          </Link>
        )}
      </div>

      {isOwner && (
        <Suspense fallback={null}>
          <JobsFilterBar jobCount={jobList.length} />
        </Suspense>
      )}

      <div className={isOwner ? 'mb-4' : 'mb-6'}>
        <Suspense fallback={null}>
          <ViewSwitcher prominent={!isOwner} />
        </Suspense>
      </div>

      {view === 'calendar' && <CalendarView jobs={filtered} />}
      {view === 'timeline' && <TimelineView jobs={filtered} team={team} />}
      {view === 'kanban' && <KanbanBoard initialJobs={filtered} isOwner={isOwner} profile={profile} />}
      {view === 'list' && <JobListView jobs={filtered} isOwner={isOwner} profile={profile} />}
      {view === 'crew' && (
        <CrewWeekView
          jobs={filtered}
          team={team}
          crewMembers={crewMembers}
          assignments={crewAssignments}
        />
      )}
      {!['calendar', 'timeline', 'kanban', 'list', 'crew'].includes(view) && (
        <TodayUpcomingJobs jobs={filtered} />
      )}
    </div>
  )
}
