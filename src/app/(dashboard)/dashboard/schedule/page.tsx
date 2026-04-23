import { headers } from 'next/headers'
import ScheduleCalendar from '@/components/dashboard/ScheduleCalendar'
import IcsSubscribeButton from '@/components/dashboard/IcsSubscribeButton'

export const metadata = {
  title: 'Schedule — Aguirre Modern Tile',
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

      <ScheduleCalendar />
    </div>
  )
}
