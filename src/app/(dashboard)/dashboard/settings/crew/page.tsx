import { redirect } from 'next/navigation'
import CrewManager from '@/components/dashboard/CrewManager'
import { shouldUseDemoData } from '@/lib/useDemoFallback'
import type { CrewMember } from '@/lib/supabase/types'

// Owner-only crew roster management. Crew members are NOT dashboard logins
// (migration 039) — this is just where rates / who's active are maintained.
export default async function CrewSettingsPage() {
  let crew: CrewMember[] = []

  const useDemo = await shouldUseDemoData()
  if (!useDemo) {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (profile?.role !== 'owner') {
        redirect('/dashboard')
      }
      const { data } = await supabase
        .from('crew_members')
        .select('*')
        .order('full_name')
      crew = (data ?? []) as CrewMember[]
    }
  }

  return (
    <div className="max-w-3xl">
      <CrewManager initialCrew={crew} />
    </div>
  )
}
