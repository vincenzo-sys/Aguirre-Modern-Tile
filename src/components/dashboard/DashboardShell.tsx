'use client'

import Sidebar from './Sidebar'
import type { Profile } from '@/lib/supabase/types'

export default function DashboardShell({
  children,
  profile,
}: {
  children: React.ReactNode
  profile: Profile
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar profile={profile} />
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
