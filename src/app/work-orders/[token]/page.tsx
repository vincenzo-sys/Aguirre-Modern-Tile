import { notFound } from 'next/navigation'
import {
  MapPin, Phone, Calendar, ClipboardList, User, ImageIcon,
  Check, Minus, Wrench, Navigation, MessageSquare,
} from 'lucide-react'
import MaterialsChecklist, { type Material } from '@/components/work-order/MaterialsChecklist'
import LogHours from '@/components/work-order/LogHours'

type WorkOrder = {
  title: string
  client_name: string
  client_phone: string | null
  client_address: string | null
  job_type: string | null
  square_footage: number | null
  scheduled_start: string | null
  scheduled_end: string | null
  scope_of_work: string | null
  included: string[]
  not_included: string[]
  crew_instructions: string | null
  customer_provides: string | null
  materials: Material[]
  photos: { url: string; caption: string | null }[]
}

const COMPANY_PHONE = '(617) 766-1259'
const COMPANY_PHONE_TEL = '+16177661259'

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

async function fetchWorkOrder(token: string): Promise<WorkOrder | null> {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    'http://localhost:3100'
  const res = await fetch(`${baseUrl}/api/public/work-orders/${token}`, {
    cache: 'no-store',
  })
  if (!res.ok) return null
  return (await res.json()) as WorkOrder
}

export default async function WorkOrderPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const wo = await fetchWorkOrder(token)
  if (!wo) notFound()

  const mapsHref = wo.client_address
    ? `https://maps.google.com/?q=${encodeURIComponent(wo.client_address)}`
    : null

  // Pre-fill the text so Vince knows which job the crew is asking about.
  const smsHref = `sms:${COMPANY_PHONE_TEL}?&body=${encodeURIComponent(
    `Hi Vince — question about the ${wo.client_name} job:\n\n`
  )}`

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gray-900 text-white">
        <div className="max-w-2xl mx-auto px-5 py-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
            <Wrench className="w-3.5 h-3.5" />
            Work Order
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight mt-1">
            {wo.title}
          </h1>
          <p className="text-gray-400 text-sm mt-1">Aguirre Modern Tile</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-6 space-y-5 pb-28">
        {/* Schedule — top of the sheet so the crew sees WHEN at a glance */}
        {wo.scheduled_start && (
          <section className="rounded-xl border border-primary-200 bg-primary-50 p-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-primary-700 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary-900">
                  Install dates
                </p>
                <p className="text-base font-bold text-gray-900">
                  {fmtDate(wo.scheduled_start)}
                  {wo.scheduled_end && wo.scheduled_end !== wo.scheduled_start && (
                    <span className="text-gray-700"> &ndash; {fmtDate(wo.scheduled_end)}</span>
                  )}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Customer & site — tap-to-call + tap-to-navigate for the field */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <User className="w-4 h-4 text-gray-400" />
            Customer &amp; site
          </h2>
          <p className="text-lg font-semibold text-gray-900">{wo.client_name}</p>

          {wo.client_phone && (
            <a
              href={`tel:${wo.client_phone}`}
              className="mt-3 flex items-center gap-2 text-primary-700 font-medium"
            >
              <Phone className="w-4 h-4" />
              {wo.client_phone}
            </a>
          )}

          {wo.client_address && (
            <div className="mt-3">
              <div className="flex items-start gap-2 text-gray-900">
                <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <span>{wo.client_address}</span>
              </div>
              {mapsHref && (
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700"
                >
                  <Navigation className="w-4 h-4" />
                  Open in Maps
                </a>
              )}
            </div>
          )}

          {(wo.job_type || wo.square_footage) && (
            <dl className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-y-2 text-sm">
              {wo.job_type && (
                <div>
                  <dt className="text-gray-500 text-xs">Type</dt>
                  <dd className="text-gray-900">{wo.job_type}</dd>
                </div>
              )}
              {wo.square_footage && (
                <div>
                  <dt className="text-gray-500 text-xs">Area</dt>
                  <dd className="text-gray-900">{wo.square_footage} sq ft</dd>
                </div>
              )}
            </dl>
          )}
        </section>

        {/* Site photos — intake shots of the existing space + any jobsite
            reference photos, so the crew knows what they're walking into.
            Tapping opens the full-size image (zoomable on a phone). */}
        {wo.photos.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-gray-400" />
              Site photos ({wo.photos.length})
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {wo.photos.map((photo, i) => (
                <a
                  key={i}
                  href={photo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-square overflow-hidden rounded-lg bg-gray-100 border border-gray-200"
                  title={photo.caption ?? 'Site photo'}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.caption ?? 'Site photo'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Scope of work */}
        {(wo.scope_of_work || wo.included.length > 0 || wo.not_included.length > 0) && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-gray-400" />
              Scope of work
            </h2>
            {wo.scope_of_work && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {wo.scope_of_work}
              </p>
            )}
            {wo.included.length > 0 && (
              <ul className="mt-4 space-y-2 text-sm text-gray-700">
                {wo.included.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <Check className="w-4 h-4 text-primary-600 flex-shrink-0 mt-0.5" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}
            {wo.not_included.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Not included
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  {wo.not_included.map((line, i) => (
                    <li key={i} className="flex gap-2">
                      <Minus className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Materials — no prices. Tap to check off while loading the truck;
            checks persist per-job on the crew member's phone. */}
        <MaterialsChecklist materials={wo.materials} token={token} />

        {/* Crew self-logs hours here — no login, no money shown. Writes to
            labor_entries via the token-gated public route. */}
        <LogHours token={token} />

        {/* What the customer provides */}
        {wo.customer_provides && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Customer provides
            </h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{wo.customer_provides}</p>
          </section>
        )}

        {/* Crew instructions — site-specific notes (gate code, parking, etc.) */}
        {wo.crew_instructions && (
          <section className="bg-amber-50 rounded-xl border border-amber-200 p-5">
            <h2 className="text-xs font-semibold text-amber-900 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-700" />
              Crew notes
            </h2>
            <p className="text-sm text-amber-900 whitespace-pre-wrap">{wo.crew_instructions}</p>
          </section>
        )}

        {/* Reach Vince — escape hatch if something's off on site. The crew
            knows Vince, not "the office"; text pre-fills with the job. */}
        <div className="pt-2">
          <p className="text-center text-xs text-gray-500 mb-3">
            Questions on site? Vince picks up.
          </p>
          <div className="flex items-stretch gap-2">
            <a
              href={`tel:${COMPANY_PHONE_TEL}`}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 active:scale-95 transition"
            >
              <Phone className="w-4 h-4" />
              Call Vince
            </a>
            <a
              href={smsHref}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 active:scale-95 transition"
            >
              <MessageSquare className="w-4 h-4" />
              Text Vince
            </a>
          </div>
          <p className="text-center text-[11px] text-gray-400 mt-2">{COMPANY_PHONE}</p>
        </div>
      </main>

      {/* Sticky contact bar — keeps Vince one tap away while scrolling a long
          material list. Plain links, so the page stays server-rendered. */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2.5 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] z-20">
        <div className="max-w-2xl mx-auto flex items-stretch gap-2">
          <a
            href={`tel:${COMPANY_PHONE_TEL}`}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold active:scale-95 transition"
          >
            <Phone className="w-4 h-4" />
            Call Vince
          </a>
          <a
            href={smsHref}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-semibold active:scale-95 transition"
          >
            <MessageSquare className="w-4 h-4" />
            Text Vince
          </a>
        </div>
      </div>
    </div>
  )
}
