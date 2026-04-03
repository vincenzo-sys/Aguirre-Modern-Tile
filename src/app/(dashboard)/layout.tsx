import { redirect } from 'next/navigation'
import DashboardShell from '@/components/dashboard/DashboardShell'
import { isDemoMode, demoProfile } from '@/lib/demo'
import type { Profile } from '@/lib/supabase/types'

export const metadata = {
  title: 'Dashboard | Aguirre Modern Tile',
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (isDemoMode) {
    return <DashboardShell profile={demoProfile}>{children}</DashboardShell>
  }

  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      // No auth — fall back to demo mode so the dashboard is still viewable
      return <DashboardShell profile={demoProfile}>{children}</DashboardShell>
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return <DashboardShell profile={demoProfile}>{children}</DashboardShell>
    }

    return <DashboardShell profile={profile as Profile}>{children}</DashboardShell>
  } catch {
    // Supabase error — fall back to demo mode
    return <DashboardShell profile={demoProfile}>{children}</DashboardShell>
  }
}
