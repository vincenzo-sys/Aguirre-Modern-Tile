import { notFound } from 'next/navigation'
import type { JobLineItem } from '@/lib/supabase/types'
import AcceptAndPayButton from './AcceptAndPayButton'
import { Star, ShieldCheck, BadgeCheck, Phone, Check, Minus } from 'lucide-react'

type EstimateResponse = {
  title: string
  client_name: string
  client_address: string | null
  job_type: string | null
  square_footage: number | null
  scope_notes: string | null
  customer_provides: string | null
  line_items: JobLineItem[]
  estimated_cost: number | null
  deposit_amount: number
  amount_paid: number
  accepted: boolean
  accepted_at: string | null
  already_viewed: boolean
}

type ParsedScope = {
  body: string | null
  warranty: string | null
  warrantyYears: number | null
  included: string[]
  notIncluded: string[]
  payment: string | null
  validThrough: string | null
}

const COMPANY_PHONE = '(617) 766-1259'
const COMPANY_PHONE_TEL = '+16177661259'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

// Customer-facing line items collapse into 6 buckets so the estimate reads
// like a homeowner's mental model — they don't care about 2 bags of thinset
// vs 1 bag, they care about "what am I paying for materials." The internal
// dashboard still shows every line; this is presentation-only.
type CustomerGroup =
  | 'materials'
  | 'addons'
  | 'install_labor'
  | 'demo_labor'
  | 'trash'
  | 'transport'

const GROUP_ORDER: CustomerGroup[] = [
  'materials',
  'addons',
  'install_labor',
  'demo_labor',
  'trash',
  'transport',
]

const GROUP_LABEL: Record<CustomerGroup, string> = {
  materials: 'Materials',
  addons: 'Add-ons',
  install_labor: 'Install labor',
  demo_labor: 'Demo labor',
  trash: 'Trash & debris removal',
  transport: 'Travel & delivery',
}

// Add-ons in the customer's mental model = optional upgrades they choose
// (niches, benches, heated floors, decorative accents). The shower tray,
// drain, and curb are required components of a walk-in shower — they're
// materials. Match against keywords specific to upgrade-style items so
// only those land in add-ons; everything else material-category goes to
// Materials.
const ADDON_KEYWORDS = ['bench', 'niche', 'corner shelf', 'cornershelf', 'ditra-heat', 'heated floor']

function classifyLineItem(item: JobLineItem): CustomerGroup {
  if (item.category === 'materials') {
    const lower = item.description.toLowerCase()
    if (ADDON_KEYWORDS.some((k) => lower.includes(k))) return 'addons'
    return 'materials'
  }
  const desc = item.description.toLowerCase()
  if (desc.startsWith('demolition') || desc.startsWith('demo')) return 'demo_labor'
  // Trash labels have varied across engine versions: "Jobsite cleanup ...",
  // "Trash and debris removal", "Trash & debris ...". The "debris" substring
  // catches all of them.
  if (desc.startsWith('trash') || desc.startsWith('jobsite cleanup') || desc.includes('debris')) {
    return 'trash'
  }
  // Transport labels likewise: "Travel: 8 trips...", "Delivery & materials
  // transport", "Transportation (Revere base...)". Match all three prefixes.
  if (desc.startsWith('travel') || desc.startsWith('delivery') || desc.startsWith('transport')) {
    return 'transport'
  }
  return 'install_labor'
}

// Flat rendering for hand-built bundled estimates (Erwin's PDF format —
// every line is "Area Description: $Amount" with no inner category split).
// We detect this when every line item is unit='ea' and category='labor' —
// the template estimator never produces that shape (it always emits day-
// unit labor + sheet/bag/tube materials), so the heuristic uniquely
// identifies bundled hand-built quotes.
function isFlatEstimate(items: JobLineItem[]): boolean {
  if (items.length === 0) return false
  return items.every((i) => i.unit === 'ea' && i.category === 'labor')
}

function renderCustomerGroup(
  group: CustomerGroup,
  items: JobLineItem[],
  total: number,
) {
  if (items.length === 0) return null
  // Materials + add-ons render as a single category row with bullets of the
  // included items underneath. Labor / trash / transport don't list items
  // (one labor line means one description anyway).
  const showBullets = group === 'materials' || group === 'addons'
  return (
    <div className="px-6 py-3 border-b border-gray-100 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-gray-900">{GROUP_LABEL[group]}</span>
        <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
          {formatCurrency(total)}
        </span>
      </div>
      {showBullets && (
        <ul className="mt-1.5 ml-1 space-y-0.5 text-[11px] text-gray-400">
          {items.map((item, i) => (
            <li key={i} className="leading-tight">
              <span className="text-gray-300">•</span>{' '}
              {item.quantity > 1 ? `${item.quantity} × ` : ''}
              {item.description}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function parseScopeNotes(notes: string | null): ParsedScope {
  const empty: ParsedScope = {
    body: null,
    warranty: null,
    warrantyYears: null,
    included: [],
    notIncluded: [],
    payment: null,
    validThrough: null,
  }
  if (!notes) return empty

  const input = '\n' + notes
  const matches = Array.from(
    input.matchAll(/\n(SCOPE OF WORK|WARRANTY|WHAT'S INCLUDED|WHAT'S NOT INCLUDED|PAYMENT)\n/g)
  )

  const parts: { header: string; text: string }[] = []
  let lastIndex = 0
  let lastHeader = 'PREAMBLE'
  for (const m of matches) {
    const idx = m.index ?? 0
    parts.push({ header: lastHeader, text: input.slice(lastIndex, idx).trim() })
    lastHeader = m[1]
    lastIndex = idx + m[0].length
  }
  parts.push({ header: lastHeader, text: input.slice(lastIndex).trim() })

  const get = (name: string) => parts.find((p) => p.header === name)?.text ?? null

  // Prefer an explicit SCOPE OF WORK section, but fall back to the preamble
  // text before the first recognized header — many estimator outputs describe
  // the scope up front without labeling it.
  const preamble = parts.find((p) => p.header === 'PREAMBLE')?.text ?? null
  const scopeBody = get('SCOPE OF WORK') ?? preamble
  const warrantyText = get('WARRANTY')
  const includedText = get("WHAT'S INCLUDED")
  const notIncludedText = get("WHAT'S NOT INCLUDED")
  const paymentText = get('PAYMENT')

  const toBullets = (t: string | null): string[] =>
    !t
      ? []
      : t
          .split('\n')
          .map((l) => l.replace(/^[-\u2022]\s*/, '').trim())
          .filter(Boolean)

  let warrantyYears: number | null = null
  if (warrantyText) {
    const m = warrantyText.match(/(\d+)-year/i)
    if (m) warrantyYears = parseInt(m[1], 10)
  }

  let validThrough: string | null = null
  const validMatch = notes.match(/Valid\s+(\d+)\s+days\.\s+Generated\s+(\d{4}-\d{2}-\d{2})/i)
  if (validMatch) {
    const days = parseInt(validMatch[1], 10)
    const generated = new Date(validMatch[2] + 'T00:00:00')
    if (!Number.isNaN(generated.getTime())) {
      const expires = new Date(generated.getTime() + days * 24 * 60 * 60 * 1000)
      validThrough = expires.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    }
  }

  return {
    body: scopeBody,
    warranty: warrantyText,
    warrantyYears,
    included: toBullets(includedText),
    notIncluded: toBullets(notIncludedText),
    payment: paymentText,
    validThrough,
  }
}

async function fetchEstimate(token: string): Promise<EstimateResponse | null> {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    'http://localhost:3100'
  const res = await fetch(`${baseUrl}/api/public/estimates/${token}`, {
    cache: 'no-store',
  })
  if (!res.ok) return null
  return (await res.json()) as EstimateResponse
}

export default async function EstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ deposit?: string; session_id?: string }>
}) {
  const { token } = await params
  const { deposit } = await searchParams

  const estimate = await fetchEstimate(token)
  if (!estimate) notFound()

  const depositSuccess = deposit === 'success' || estimate.accepted
  const depositCancelled = deposit === 'cancelled'

  // Must match PROJECTWIDE_LABEL in generate_dashboard_estimate.py.
  const PROJECTWIDE_LABEL = 'Project-wide'

  // Group items by section in the order sections first appear, then float
  // the implicit "Project-wide" bucket (unsectioned items, trash, transport)
  // to the end so per-room costs come first. Single-section legacy jobs
  // land entirely in Project-wide and render without a section header.
  const sectionMap = new Map<string, JobLineItem[]>()
  for (const item of estimate.line_items) {
    const key = item.section || PROJECTWIDE_LABEL
    if (!sectionMap.has(key)) sectionMap.set(key, [])
    sectionMap.get(key)!.push(item)
  }
  const orderedSections = [
    ...Array.from(sectionMap.entries()).filter(([k]) => k !== PROJECTWIDE_LABEL),
    ...(sectionMap.has(PROJECTWIDE_LABEL)
      ? [[PROJECTWIDE_LABEL, sectionMap.get(PROJECTWIDE_LABEL)!] as const]
      : []),
  ]
  const showSectionHeaders =
    orderedSections.length > 1 || orderedSections[0]?.[0] !== PROJECTWIDE_LABEL

  const total =
    estimate.estimated_cost ??
    estimate.line_items.reduce((s, i) => s + (i.amount ?? 0), 0)

  const parsed = parseScopeNotes(estimate.scope_notes)
  const warrantyLabel = parsed.warrantyYears
    ? `${parsed.warrantyYears}-year labor warranty`
    : 'Labor warranty included'

  return (
    <div className="min-h-screen bg-gray-50 pb-28 md:pb-0">
      {/* Header */}
      <header className="bg-gray-900 text-white">
        <div className="max-w-3xl mx-auto px-6 py-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Aguirre Modern Tile
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                Estimate prepared for {estimate.client_name}
              </p>
            </div>
            <a
              href={`tel:${COMPANY_PHONE_TEL}`}
              className="hidden sm:inline-flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors"
            >
              <Phone className="w-4 h-4" />
              {COMPANY_PHONE}
            </a>
          </div>
        </div>

        {/* Trust band */}
        <div className="border-t border-gray-800/80">
          <div className="max-w-3xl mx-auto px-6 py-3 flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-2 text-xs text-gray-300">
            <span className="inline-flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
              5-star rated
            </span>
            <span className="h-3 w-px bg-gray-700 hidden sm:block" />
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-gray-400" />
              Licensed &amp; Insured
            </span>
            <span className="h-3 w-px bg-gray-700 hidden sm:block" />
            <span className="inline-flex items-center gap-1.5">
              <BadgeCheck className="w-3.5 h-3.5 text-gray-400" />
              {warrantyLabel}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {/* Success banner */}
        {depositSuccess && (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-5">
            <h2 className="text-lg font-semibold text-green-900 mb-1">
              Deposit received — thank you!
            </h2>
            {(estimate.amount_paid > 0 || estimate.accepted_at) && (
              <p className="text-sm font-medium text-green-900 mb-1">
                {estimate.amount_paid > 0 && `Paid ${formatCurrency(estimate.amount_paid)}`}
                {estimate.amount_paid > 0 && estimate.accepted_at && ' on '}
                {estimate.accepted_at &&
                  new Date(estimate.accepted_at).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
              </p>
            )}
            <p className="text-sm text-green-800">
              Your install date is reserved. We&apos;ll be in touch within 24 hours to confirm the schedule.
            </p>
          </div>
        )}

        {/* Cancelled banner */}
        {depositCancelled && !depositSuccess && (
          <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
            <p className="text-sm text-yellow-900">
              Payment was cancelled. You can accept and pay the deposit anytime below.
            </p>
          </div>
        )}

        {/* Project */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900">{estimate.title}</h2>
          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 text-sm">
            {estimate.job_type && (
              <div>
                <dt className="text-gray-500">Project type</dt>
                <dd className="text-gray-900">{estimate.job_type}</dd>
              </div>
            )}
            {estimate.square_footage && (
              <div>
                <dt className="text-gray-500">Area</dt>
                <dd className="text-gray-900">{estimate.square_footage} sq ft</dd>
              </div>
            )}
            {estimate.client_address && (
              <div className="sm:col-span-2">
                <dt className="text-gray-500">Address</dt>
                <dd className="text-gray-900">{estimate.client_address}</dd>
              </div>
            )}
          </dl>

          {parsed.body && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Scope of work
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{parsed.body}</p>
            </div>
          )}
        </section>

        {/* What's included / not included */}
        {(parsed.included.length > 0 || parsed.notIncluded.length > 0) && (
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {parsed.included.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  What&apos;s included
                </h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  {parsed.included.map((line, i) => (
                    <li key={i} className="flex gap-2">
                      <Check className="w-4 h-4 text-primary-600 flex-shrink-0 mt-0.5" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {parsed.notIncluded.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Not included
                </h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  {parsed.notIncluded.map((line, i) => (
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

        {/* Warranty callout */}
        {parsed.warranty && (
          <section className="bg-primary-50 rounded-xl border border-primary-100 p-5 mb-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-primary-700 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-primary-900">
                  {warrantyLabel}
                </h3>
                <p className="text-sm text-primary-800 mt-1">{parsed.warranty}</p>
              </div>
            </div>
          </section>
        )}

        {/* Line items */}
        {estimate.line_items.length > 0 && (
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
            <div className="px-6 py-3 bg-gray-100 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                Pricing breakdown
              </h3>
            </div>

            {isFlatEstimate(estimate.line_items) ? (
              // Flat table — Description + Amount, like the PDF format Vince
              // hands customers for bundled quotes.
              <div className="divide-y divide-gray-100">
                {estimate.line_items.map((item, idx) => (
                  <div key={idx} className="px-6 py-3 flex items-start justify-between gap-4">
                    <p className="text-sm text-gray-900 flex-1">{item.description}</p>
                    <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            ) : orderedSections.map(([sectionKey, sectionItems], sIdx) => {
              // Bucket each line item into one of the six customer-facing
              // groups, then render any non-empty group as a single row.
              const groups: Record<CustomerGroup, { items: JobLineItem[]; total: number }> = {
                materials: { items: [], total: 0 },
                addons: { items: [], total: 0 },
                install_labor: { items: [], total: 0 },
                demo_labor: { items: [], total: 0 },
                trash: { items: [], total: 0 },
                transport: { items: [], total: 0 },
              }
              for (const item of sectionItems) {
                const g = classifyLineItem(item)
                groups[g].items.push(item)
                groups[g].total += item.amount ?? 0
              }
              const subtotal = sectionItems.reduce((s, i) => s + (i.amount ?? 0), 0)
              return (
                <div key={sectionKey}>
                  {showSectionHeaders && (
                    <div
                      className={`px-6 py-3 bg-primary-50 border-b border-primary-100 flex items-center justify-between ${
                        sIdx > 0 ? 'border-t-4 border-t-gray-100' : ''
                      }`}
                    >
                      <span className="text-sm font-semibold text-primary-900 uppercase tracking-wider">
                        {sectionKey}
                      </span>
                      <span className="text-sm font-semibold text-primary-900">
                        {formatCurrency(subtotal)}
                      </span>
                    </div>
                  )}
                  {GROUP_ORDER.map((g) =>
                    renderCustomerGroup(g, groups[g].items, groups[g].total)
                  )}
                </div>
              )
            })}
          </section>
        )}

        {/* Total + deposit */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-gray-500">Total estimate</span>
            <span className="text-3xl font-bold text-gray-900">{formatCurrency(total)}</span>
          </div>
          <div className="flex items-baseline justify-between pt-3 border-t border-gray-100">
            <span className="text-gray-700 font-medium">
              10% deposit to reserve your install date
            </span>
            <span className="text-xl font-semibold text-primary-700">
              {formatCurrency(estimate.deposit_amount)}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            The remainder is due on completion of the project.
          </p>
          {parsed.validThrough && (
            <p className="text-xs text-gray-400 mt-2">
              Estimate valid through {parsed.validThrough}
            </p>
          )}
        </section>

        {/* What happens next */}
        {!depositSuccess && (
          <section className="mb-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 text-center">
              What happens next
            </h3>
            <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { n: '1', t: 'Pay 10% deposit', d: 'Reserve your install date with Stripe — secure checkout.' },
                { n: '2', t: 'We confirm within 24h', d: 'You\u2019ll hear from us to lock in the schedule.' },
                { n: '3', t: 'We show up ready', d: 'Full crew, all materials, jobsite protected.' },
              ].map((step) => (
                <li
                  key={step.n}
                  className="bg-white rounded-lg border border-gray-200 p-4"
                >
                  <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary-100 text-primary-700 font-semibold text-sm mb-2">
                    {step.n}
                  </div>
                  <p className="text-sm font-medium text-gray-900">{step.t}</p>
                  <p className="text-xs text-gray-500 mt-1">{step.d}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Accept / pay — desktop */}
        {!depositSuccess && (
          <section className="hidden md:block bg-primary-50 rounded-xl border border-primary-200 p-6 text-center">
            <h3 className="text-lg font-semibold text-primary-900 mb-1">
              Ready to move forward?
            </h3>
            <p className="text-sm text-primary-800 mb-5">
              Accept the estimate and pay the deposit in one step — secured by Stripe.
            </p>
            <AcceptAndPayButton
              token={token}
              depositAmount={estimate.deposit_amount}
            />
          </section>
        )}

        {/* Phone CTA */}
        <p className="text-sm text-gray-500 text-center mt-6">
          Questions?{' '}
          <a
            href={`tel:${COMPANY_PHONE_TEL}`}
            className="text-primary-700 font-medium hover:text-primary-800"
          >
            Call {COMPANY_PHONE}
          </a>
        </p>
      </main>

      {/* Sticky mobile CTA */}
      {!depositSuccess && (
        <div className="fixed bottom-0 left-0 right-0 md:hidden bg-white border-t border-gray-200 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] z-20">
          <div className="flex items-center justify-between gap-3 max-w-3xl mx-auto">
            <div className="flex-shrink-0">
              <div className="text-[11px] text-gray-500 leading-tight">10% deposit</div>
              <div className="text-lg font-semibold text-gray-900 leading-tight">
                {formatCurrency(estimate.deposit_amount)}
              </div>
            </div>
            <AcceptAndPayButton
              token={token}
              depositAmount={estimate.deposit_amount}
              compact
            />
          </div>
        </div>
      )}
    </div>
  )
}
