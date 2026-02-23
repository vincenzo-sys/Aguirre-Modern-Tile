'use client'

import dynamic from 'next/dynamic'
import type { Profile, JobWithAssignee } from '@/lib/supabase/types'

const TeamMapInner = dynamic(() => import('./TeamMapInner'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-500">Loading map...</p>
    </div>
  ),
})

interface TeamMapProps {
  team: Profile[]
  jobs: JobWithAssignee[]
  jobCoords: Record<string, [number, number]>
}

export default function TeamMap({ team, jobs, jobCoords }: TeamMapProps) {
  return <TeamMapInner team={team} jobs={jobs} jobCoords={jobCoords} />
}
