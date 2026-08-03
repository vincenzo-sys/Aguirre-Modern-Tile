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
  // Demo mode: no Supabase configured at all
  if (isDemoMode) {
    return <DashboardShell profile={demoProfile}>{children}</DashboardShell>
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    // The credentials were valid — this account just has no profiles row, so
    // it has no role and can't be authorized. Without the reason on the query
    // string this looks identical to a wrong password, and the user retypes
    // it forever. Surfaced on the login page.
    console.error(`[auth] no profiles row for auth user ${user.id} (${user.email}) — denying dashboard access`)
    redirect('/login?error=no_profile')
  }

  return <DashboardShell profile={profile as Profile}>{children}</DashboardShell>
}
