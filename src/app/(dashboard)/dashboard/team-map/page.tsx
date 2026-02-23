import { isDemoMode, demoTeamMembers, demoJobs, demoJobCoordinates } from '@/lib/demo'
import type { Profile, JobWithAssignee } from '@/lib/supabase/types'
import TeamMap from '@/components/dashboard/TeamMap'

export default async function TeamMapPage() {
  let team: Profile[] = []
  let jobs: JobWithAssignee[] = []
  let jobCoords: Record<string, [number, number]> = {}

  if (isDemoMode) {
    team = demoTeamMembers
    jobs = demoJobs
    jobCoords = demoJobCoordinates
  } else {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()

    const { data: teamData } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_active', true)
    team = (teamData ?? []) as Profile[]

    const { data: jobData } = await supabase
      .from('jobs')
      .select('*')
      .not('status', 'eq', 'cancelled')
    jobs = (jobData ?? []) as JobWithAssignee[]
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Team Map</h1>
        <p className="text-sm text-gray-500 mt-1">Team member and job site locations</p>
      </div>

      {isDemoMode && (
        <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 p-3">
          <p className="text-sm text-amber-800">
            <strong>Demo Mode</strong> — Showing hardcoded Boston-area locations.
          </p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden" style={{ height: '600px' }}>
        <TeamMap team={team} jobs={jobs} jobCoords={jobCoords} />
      </div>
    </div>
  )
}
