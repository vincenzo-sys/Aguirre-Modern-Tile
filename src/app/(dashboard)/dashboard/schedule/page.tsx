import { headers } from 'next/headers'
import ScheduleCalendar from '@/components/dashboard/ScheduleCalendar'
import IcsSubscribeButton from '@/components/dashboard/IcsSubscribeButton'
import { createClient } from '@/lib/supabase/server'
import { BRAND } from '@/brand.config'
import type { JobPickerOption } from '@/lib/jobPicker'

export const metadata = {
  title: `Schedule — ${BRAND.company.name}`,
}

export default async function SchedulePage() {
  // Build the iCal subscribe URL server-side so the secret token never lives in
  // client-side JS bundles. The page is auth-gated by middleware, so it only
  // renders for owner/installer profiles.
  const apiKey = process.env.TILE_API_KEY ?? ''
  const hdrs = await headers()
  const host = hdrs.get('host') ?? 'aguirremoderntile.com'
  const proto = hdrs.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https')
  const icsUrl = apiKey ? `${proto}://${host}/api/schedule.ics?key=${apiKey}` : ''

  // Jobs feed the "link to job" picker in both modals.
  //
  // No status filter: Vince asked to be able to link ANY job, and the previous
  // filter made paid/lead/quoted/cancelled work unreachable. Relevance is the
  // picker's job now (see lib/jobPicker.ts), which groups jobs-needing-a-date
  // first and collapses finished work — the old ORDER BY scheduled_start DESC
  // NULLS LAST did the exact opposite, sinking every unscheduled job below
  // every completed one and then cutting them off at LIMIT 100.
  //
  // Ordering by job_number is a stable, never-null proxy for recency.
  // The column list is explicit because '*' would ship line_items (large
  // JSONB) for every job into the RSC payload for nothing.
  let jobs: JobPickerOption[] = []
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('jobs')
      .select(
        'id, job_number, title, status, client_name, client_address, client_phone, client_email, scheduled_start, scheduled_end, estimated_days, estimated_cost, deposit_paid, amount_paid',
      )
      .order('job_number', { ascending: false })
      .limit(500)
    jobs = (data ?? []) as JobPickerOption[]
  } catch {
    // Schedule still works without the picker.
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          <p className="text-sm text-gray-500 mt-1">
            Estimate visits and scheduled installs in one place.
          </p>
        </div>
        {icsUrl && <IcsSubscribeButton icsUrl={icsUrl} />}
      </div>

      <ScheduleCalendar jobs={jobs} />
    </div>
  )
}
