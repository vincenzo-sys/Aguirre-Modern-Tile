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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-6 sm:pt-8 sm:pb-8 lg:pt-8">
          {children}
        </div>
      </main>
    </div>
  )
}
