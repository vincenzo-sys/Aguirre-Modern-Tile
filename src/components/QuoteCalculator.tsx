'use client'

import { useState, useMemo } from 'react'
import { ClipboardList, ArrowRight, Camera, Home, Droplets, Grid3X3, Wrench, Check, Info } from 'lucide-react'
import Link from 'next/link'

type RoomKey = 'bathroom' | 'shower' | 'floor' | 'backsplash'

// Base labor days for a 2-person crew on a "small / standard-complexity" job
// of this type. Multiplied by size and complexity below. Demo adds extra days
// flat. These numbers are what the install actually takes — not pricing — so
// a homeowner can compare them against any real quote they get.
const roomTypes: {
  value: RoomKey
  label: string
  icon: typeof Home
  daysMin: number
  daysMax: number
  // Scope items that are *always* in our work for this project type. Builds
  // trust by showing what "included" really means at our pricing tier.
  scope: string[]
}[] = [
  {
    value: 'bathroom',
    label: 'Bathroom',
    icon: Home,
    daysMin: 4,
    daysMax: 6,
    scope: [
      'Schluter KERDI or equivalent waterproofing on shower walls',
      'Cement board / GO-BOARD substrate prep',
      'Modified thinset (no pre-mixed mastic in wet areas)',
      'Plumb / level checks before tile goes up',
      '2-year workmanship warranty',
    ],
  },
  {
    value: 'shower',
    label: 'Shower',
    icon: Droplets,
    daysMin: 2,
    daysMax: 4,
    scope: [
      'Full waterproofing system (KERDI-BOARD or KERDI membrane)',
      'Pre-pitched shower pan with bonded drain',
      'Sealed corners and seams (banded with KERDI-BAND)',
      'Niche framed and waterproofed before tile',
      '2-year workmanship warranty',
    ],
  },
  {
    value: 'floor',
    label: 'Floor',
    icon: Grid3X3,
    daysMin: 1,
    daysMax: 3,
    scope: [
      'Subfloor inspection — flatness, deflection, screw-down where needed',
      'Strata Mat uncoupling membrane (Laticrete) — standard on all our floor installs',
      'Full thinset coverage under every tile',
      'Heated-floor compatible install',
      '2-year workmanship warranty',
    ],
  },
  {
    value: 'backsplash',
    label: 'Backsplash',
    icon: Wrench,
    daysMin: 1,
    daysMax: 2,
    scope: [
      'Wall prep, prime, level layout from countertop',
      'Outlet spacers + clean tile cuts around boxes',
      'Color-matched grout and sealed edges',
      '2-year workmanship warranty',
    ],
  },
]

const sizes = [
  { value: 'small', label: 'Small', sub: '<50 sq ft', multiplier: 1 },
  { value: 'medium', label: 'Medium', sub: '50–100 sq ft', multiplier: 1.5 },
  { value: 'large', label: 'Large', sub: '100+ sq ft', multiplier: 2.2 },
]

const complexities = [
  { value: 'standard', label: 'Standard', sub: 'Typical install', multiplier: 1 },
  { value: 'moderate', label: 'Moderate', sub: 'Patterns, niches', multiplier: 1.25 },
  { value: 'complex', label: 'Complex', sub: 'Custom work', multiplier: 1.5 },
]

// Published rate for a 2-person crew. Showing this openly is the calculator's
// real value — most contractors hide it. Final cost depends on tile choice,
// demo, subfloor condition, and shower complexity, none of which a calculator
// can see, which is exactly the point we want to make.
const CREW_RATE_MIN = 800
const CREW_RATE_MAX = 1200

interface Props {
  defaultRoomType?: RoomKey
  className?: string
}

export default function QuoteCalculator({ defaultRoomType, className = '' }: Props) {
  const [roomType, setRoomType] = useState<RoomKey | ''>(defaultRoomType || '')
  const [size, setSize] = useState('')
  const [complexity, setComplexity] = useState('')
  const [needsDemo, setNeedsDemo] = useState(false)

  // Computed labor days, not dollars. Days are something a calculator can
  // honestly estimate; a final dollar figure isn't.
  const profile = useMemo(() => {
    if (!roomType || !size || !complexity) return null
    const room = roomTypes.find((r) => r.value === roomType)
    const sizeOption = sizes.find((s) => s.value === size)
    const complexityOption = complexities.find((c) => c.value === complexity)
    if (!room || !sizeOption || !complexityOption) return null

    let daysMin = room.daysMin * sizeOption.multiplier * complexityOption.multiplier
    let daysMax = room.daysMax * sizeOption.multiplier * complexityOption.multiplier
    if (needsDemo) {
      // Demo of existing tile adds roughly half a day (small) to a day and a
      // half (large bathroom with old mortar bed). Conservative range.
      daysMin += 0.5
      daysMax += 1.5
    }
    // Round to half-days for legibility — "4.3 days" reads worse than "4–5 days".
    const round = (n: number) => Math.round(n * 2) / 2
    daysMin = round(daysMin)
    daysMax = round(daysMax)

    const laborMin = Math.round((daysMin * CREW_RATE_MIN) / 100) * 100
    const laborMax = Math.round((daysMax * CREW_RATE_MAX) / 100) * 100

    return { daysMin, daysMax, laborMin, laborMax, room }
  }, [roomType, size, complexity, needsDemo])

  return (
    <div className={`bg-white rounded-2xl shadow-xl p-5 sm:p-8 ${className}`}>
      <div className="flex items-center gap-3 mb-5 sm:mb-6">
        <div className="w-11 h-11 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <ClipboardList className="w-6 h-6 text-primary-600" />
        </div>
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">Plan your project — without the sales pitch</h3>
          <p className="text-gray-500 text-xs sm:text-sm">Tap your project. We&apos;ll show you what&apos;s involved and what we charge for crew time.</p>
        </div>
      </div>

      <div className="space-y-5">
        <Picker
          label="Project type"
          options={roomTypes.map((r) => ({ value: r.value, label: r.label, icon: r.icon }))}
          value={roomType}
          onChange={(v) => setRoomType(v as RoomKey)}
          columns={4}
        />

        <Picker
          label="Size"
          options={sizes.map((s) => ({ value: s.value, label: s.label, sub: s.sub }))}
          value={size}
          onChange={setSize}
          columns={3}
        />

        <Picker
          label="Complexity"
          options={complexities.map((c) => ({ value: c.value, label: c.label, sub: c.sub }))}
          value={complexity}
          onChange={setComplexity}
          columns={3}
        />

        <button
          type="button"
          onClick={() => setNeedsDemo(!needsDemo)}
          className={`w-full flex items-center justify-between gap-3 p-4 border-2 rounded-xl transition-colors text-left ${
            needsDemo ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div>
            <p className="font-medium text-gray-900">Need demo / removal?</p>
            <p className="text-xs text-gray-500">Tearing out old tile or fixtures</p>
          </div>
          <div
            className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
              needsDemo ? 'bg-primary-600 border-primary-600' : 'border-gray-300'
            }`}
          >
            {needsDemo && (
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </button>

        {profile && (
          <div className="mt-4 space-y-4">
            {/* Labor days + crew cost — the part a calculator can be honest
                about. Materials/tile cost is intentionally NOT computed. */}
            <div className="p-5 sm:p-6 bg-primary-50 rounded-xl border border-primary-100">
              <p className="text-xs font-semibold text-primary-700 uppercase tracking-wider mb-3">
                Your project, by the numbers
              </p>

              <div className="space-y-3">
                <Row label="Estimated install time">
                  <span className="font-bold text-primary-900">
                    {profile.daysMin === profile.daysMax
                      ? `${profile.daysMin} days`
                      : `${profile.daysMin}–${profile.daysMax} days`}
                  </span>{' '}
                  <span className="text-gray-600 text-sm">for a 2-person crew</span>
                </Row>
                <Row label="Crew time at our published rate">
                  <span className="font-bold text-primary-900">
                    ${profile.laborMin.toLocaleString()}–${profile.laborMax.toLocaleString()}
                  </span>{' '}
                  <span className="text-gray-600 text-sm">
                    (${CREW_RATE_MIN}–${CREW_RATE_MAX}/day, 2 installers)
                  </span>
                </Row>
                <Row label="Tile + waterproofing materials">
                  <span className="text-gray-700">Varies by tile choice + scope</span>
                </Row>
                {needsDemo && (
                  <Row label="Demo / haul-away">
                    <span className="text-gray-700">Included in install time above</span>
                  </Row>
                )}
              </div>

              <p className="text-xs text-primary-700 mt-4 italic">
                Crew time is the part we can quote upfront. Materials depend on what tile you pick — we&apos;ll help you spec it.
              </p>
            </div>

            {/* What's already in scope at this size — the trust-builder. */}
            <div className="p-5 sm:p-6 bg-white rounded-xl border border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                What that buys you (always included)
              </p>
              <ul className="space-y-2">
                {profile.room.scope.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* What we honestly can't tell from a calculator. Sets the frame. */}
            <div className="p-5 sm:p-6 bg-amber-50 rounded-xl border border-amber-200">
              <div className="flex items-start gap-2 mb-2">
                <Info className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-amber-900 uppercase tracking-wider">
                  What this calculator can&apos;t see
                </p>
              </div>
              <p className="text-sm text-amber-900 mb-3">
                Anyone who quotes you an exact number from a webpage is guessing. To give you a real written estimate we need to know:
              </p>
              <ul className="space-y-1.5 text-sm text-amber-900">
                <li className="flex items-start gap-2">
                  <span className="text-amber-700">•</span>
                  <span>Photos of the current space (or a 15-minute visit)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-700">•</span>
                  <span>Tile choice — or your budget per square foot</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-700">•</span>
                  <span>Subfloor / wall condition (we&apos;ll spot it from photos)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-700">•</span>
                  <span>Niches, benches, curbs, glass — the small things drive labor</span>
                </li>
              </ul>
            </div>

            {/* Two CTAs — primary is the photo upload (real estimate),
                secondary is the no-commitment "text us a tile" lead magnet. */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href={buildContactHref({ roomType, size, complexity, needsDemo, profile })}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 active:scale-95 transition text-sm"
              >
                <Camera className="w-4 h-4" />
                Send photos for a real estimate
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="sms:+16177661259?body=Hi%20Vince%2C%20thinking%20about%20this%20tile%20%E2%80%94%20can%20you%20tell%20me%20if%20it%E2%80%99ll%20work%3F"
                className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-white text-primary-700 border-2 border-primary-600 rounded-lg font-semibold hover:bg-primary-50 active:scale-95 transition text-sm"
              >
                Text us a tile to review
              </a>
            </div>
          </div>
        )}

        {!profile && (
          <p className="text-center text-xs text-gray-400">
            Pick all three to see what&apos;s involved.
          </p>
        )}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-3">
      <span className="text-xs sm:text-sm text-gray-600 sm:flex-shrink-0">{label}</span>
      <span className="text-sm sm:text-base sm:text-right">{children}</span>
    </div>
  )
}

function buildContactHref({
  roomType,
  size,
  complexity,
  needsDemo,
  profile,
}: {
  roomType: RoomKey | ''
  size: string
  complexity: string
  needsDemo: boolean
  profile: { daysMin: number; daysMax: number; laborMin: number; laborMax: number }
}): string {
  const roomLabel = roomTypes.find((r) => r.value === roomType)?.label || ''
  const sizeLabel = sizes.find((s) => s.value === size)?.sub || size
  const complexityLabel = complexities.find((c) => c.value === complexity)?.label || complexity
  const description = [
    roomLabel && `Project: ${roomLabel}`,
    sizeLabel && `Size: ${sizeLabel}`,
    complexityLabel && `Complexity: ${complexityLabel}`,
    needsDemo && 'Includes demo / removal of existing tile',
    `Planner estimate: ${profile.daysMin}–${profile.daysMax} days install · crew time ~$${profile.laborMin.toLocaleString()}–$${profile.laborMax.toLocaleString()}`,
  ].filter(Boolean).join('\n')
  const params = new URLSearchParams({ description, type: roomType || '' })
  return `/contact?${params.toString()}`
}

function Picker({
  label,
  options,
  value,
  onChange,
  columns,
}: {
  label: string
  options: { value: string; label: string; sub?: string; icon?: typeof Home }[]
  value: string
  onChange: (v: string) => void
  columns: 3 | 4
}) {
  const gridCols = columns === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className={`grid ${gridCols} gap-2`}>
        {options.map((opt) => {
          const active = value === opt.value
          const Icon = opt.icon
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`flex flex-col items-center justify-center text-center px-2 py-3 sm:py-4 border-2 rounded-xl transition-all active:scale-95 ${
                active
                  ? 'border-primary-500 bg-primary-50 text-primary-900'
                  : 'border-gray-200 text-gray-700 hover:border-primary-300'
              }`}
            >
              {Icon && <Icon className={`w-5 h-5 mb-1 ${active ? 'text-primary-600' : 'text-gray-400'}`} />}
              <span className="text-sm font-semibold leading-tight">{opt.label}</span>
              {opt.sub && <span className="text-[11px] text-gray-500 leading-tight mt-0.5">{opt.sub}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
