'use client'

import { useState } from 'react'
import JobCard from './JobCard'
import type { JobWithAssignee, Profile } from '@/lib/supabase/types'

interface JobListViewProps {
  jobs: JobWithAssignee[]
  isOwner: boolean
  profile: Profile
}

export default function JobListView({ jobs, isOwner, profile }: JobListViewProps) {
  const [myJobsOnly, setMyJobsOnly] = useState(false)

  const filtered = myJobsOnly ? jobs.filter((j) => j.assigned_to === profile.id) : jobs

  return (
    <div>
      {!isOwner && (
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => setMyJobsOnly(false)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              !myJobsOnly ? 'bg-primary-100 text-primary-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            All Jobs
          </button>
          <button
            onClick={() => setMyJobsOnly(true)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              myJobsOnly ? 'bg-primary-100 text-primary-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            My Jobs
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500">{myJobsOnly ? 'No jobs assigned to you.' : 'No jobs yet.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((job) => {
            const isMyJob = !isOwner && job.assigned_to === profile.id
            return (
              <div
                key={job.id}
                className={isMyJob ? 'border-l-4 border-l-primary-500 rounded-lg' : ''}
              >
                <JobCard job={job} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
