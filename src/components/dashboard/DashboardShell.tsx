'use client'

import Sidebar from './Sidebar'
import MobileTabBar from './MobileTabBar'
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
        {/* Mobile padding accounts for the bottom tab bar (~64px + iPhone
            safe area). Desktop keeps the original generous py-8 since
            there's no fixed bottom UI. The pt-4 on mobile (vs pt-16 before)
            reflects that the floating Menu button is gone — the tab bar at
            the bottom is the new mobile chrome. */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-36 sm:pt-8 sm:pb-8 lg:pt-8">
          {children}
        </div>
      </main>
      <MobileTabBar profile={profile} />
    </div>
  )
}
