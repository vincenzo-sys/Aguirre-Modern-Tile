import type { JobWithAssignee, Profile } from '@/lib/supabase/types'

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function CrewWorkload({
  jobs,
  team,
}: {
  jobs: JobWithAssignee[]
  team: Profile[]
}) {
  const activeStatuses = ['scheduled', 'in_progress', 'quoted']
  const activeJobs = jobs.filter((j) => activeStatuses.includes(j.status))

  const crewData = team.map((member) => {
    const memberJobs = activeJobs.filter((j) => j.assigned_to === member.id)
    return { member, jobs: memberJobs }
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="px-4 py-3 bg-gray-800 rounded-t-xl">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
          Crew Workload
        </h3>
      </div>
      <div className="divide-y divide-gray-100">
        {crewData.map(({ member, jobs: memberJobs }) => (
          <div key={member.id} className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold">
                  {getInitials(member.full_name)}
                </div>
                <span className="text-sm font-medium text-gray-900">{member.full_name}</span>
              </div>
              <span className="text-xs font-medium text-gray-500">
                {memberJobs.length} job{memberJobs.length !== 1 ? 's' : ''}
              </span>
            </div>
            {memberJobs.length > 0 && (
              <div className="ml-10 space-y-1">
                {memberJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 truncate">{job.client_name} &middot; {job.title}</span>
                    <span className={`shrink-0 ml-2 px-1.5 py-0.5 rounded-full text-xs font-medium ${
                      job.status === 'in_progress'
                        ? 'bg-yellow-100 text-yellow-700'
                        : job.status === 'scheduled'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {job.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
