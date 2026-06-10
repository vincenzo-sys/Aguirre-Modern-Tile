import { notFound } from 'next/navigation'
import {
  MapPin, Phone, Calendar, Package, ClipboardList, User, ExternalLink,
  Check, Minus, Wrench, Navigation,
} from 'lucide-react'

type Material = {
  description: string
  quantity: number
  unit: string
  status: 'needed' | 'ordered' | 'received' | 'on_site' | null
  source_url: string | null
  source_name: string | null
  section: string | null
}

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
}

const COMPANY_PHONE = '(617) 766-1259'
const COMPANY_PHONE_TEL = '+16177661259'

// Material status → label + color. Mirrors the dashboard's MaterialStatus
// so the crew sees the same "is it here yet?" state the office tracks.
const STATUS_META: Record<NonNullable<Material['status']>, { label: string; cls: string }> = {
  needed: { label: 'Needed', cls: 'bg-gray-100 text-gray-600' },
  ordered: { label: 'Ordered', cls: 'bg-blue-100 text-blue-700' },
  received: { label: 'Received', cls: 'bg-amber-100 text-amber-700' },
  on_site: { label: 'On site', cls: 'bg-green-100 text-green-700' },
}

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

  // Group materials by section so multi-room jobs read room-by-room. Items
  // with no section fall under a single unlabeled bucket.
  const PROJECTWIDE = 'Project-wide'
  const sectionMap = new Map<string, Material[]>()
  for (const m of wo.materials) {
    const key = m.section || PROJECTWIDE
    if (!sectionMap.has(key)) sectionMap.set(key, [])
    sectionMap.get(key)!.push(m)
  }
  const sections = Array.from(sectionMap.entries())
  const showSectionHeaders = sections.length > 1 || sections[0]?.[0] !== PROJECTWIDE

  const mapsHref = wo.client_address
    ? `https://maps.google.com/?q=${encodeURIComponent(wo.client_address)}`
    : null

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

      <main className="max-w-2xl mx-auto px-5 py-6 space-y-5 pb-12">
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

        {/* Materials checklist — no prices, just what's needed and where */}
        {wo.materials.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-100 border-b border-gray-200 flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-500" />
              <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Materials ({wo.materials.length})
              </h2>
            </div>
            {sections.map(([sectionKey, items]) => (
              <div key={sectionKey}>
                {showSectionHeaders && (
                  <div className="px-5 py-2 bg-primary-50 border-b border-primary-100">
                    <span className="text-xs font-semibold text-primary-900 uppercase tracking-wider">
                      {sectionKey}
                    </span>
                  </div>
                )}
                <ul className="divide-y divide-gray-100">
                  {items.map((m, i) => (
                    <li key={i} className="px-5 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900">{m.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-500">
                            {m.quantity} {m.unit}
                          </span>
                          {m.source_url && (
                            <a
                              href={m.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-xs text-primary-600 hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              {m.source_name || 'Source'}
                            </a>
                          )}
                        </div>
                      </div>
                      {m.status && (
                        <span
                          className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_META[m.status].cls}`}
                        >
                          {STATUS_META[m.status].label}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

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

        {/* Office contact — escape hatch if something's off on site */}
        <div className="text-center pt-2">
          <p className="text-xs text-gray-500 mb-2">Questions on site? Call the office.</p>
          <a
            href={`tel:${COMPANY_PHONE_TEL}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors"
          >
            <Phone className="w-4 h-4" />
            {COMPANY_PHONE}
          </a>
        </div>
      </main>
    </div>
  )
}
