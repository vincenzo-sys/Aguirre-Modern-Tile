'use client'

import { useState, useEffect } from 'react'
import { Calculator, ArrowRight, Home, Droplets, Grid3X3, Wrench } from 'lucide-react'
import Link from 'next/link'

type RoomKey = 'bathroom' | 'shower' | 'floor' | 'backsplash'

const roomTypes: { value: RoomKey; label: string; icon: typeof Home; baseMin: number; baseMax: number }[] = [
  { value: 'bathroom', label: 'Bathroom', icon: Home, baseMin: 4500, baseMax: 8000 },
  { value: 'shower', label: 'Shower', icon: Droplets, baseMin: 2500, baseMax: 5000 },
  { value: 'floor', label: 'Floor', icon: Grid3X3, baseMin: 1500, baseMax: 4000 },
  { value: 'backsplash', label: 'Backsplash', icon: Wrench, baseMin: 800, baseMax: 2000 },
]

const sizes = [
  { value: 'small', label: 'Small', sub: '<50 sq ft', multiplier: 1 },
  { value: 'medium', label: 'Medium', sub: '50–100 sq ft', multiplier: 1.5 },
  { value: 'large', label: 'Large', sub: '100+ sq ft', multiplier: 2.2 },
]

const complexities = [
  { value: 'standard', label: 'Standard', sub: 'Typical install', multiplier: 1 },
  { value: 'moderate', label: 'Moderate', sub: 'Patterns, niches', multiplier: 1.3 },
  { value: 'complex', label: 'Complex', sub: 'Custom work', multiplier: 1.6 },
]

interface Props {
  defaultRoomType?: RoomKey
  className?: string
}

export default function QuoteCalculator({ defaultRoomType, className = '' }: Props) {
  const [roomType, setRoomType] = useState<RoomKey | ''>(defaultRoomType || '')
  const [size, setSize] = useState('')
  const [complexity, setComplexity] = useState('')
  const [needsDemo, setNeedsDemo] = useState(false)
  const [estimate, setEstimate] = useState<{ min: number; max: number } | null>(null)

  // Auto-recalculate as soon as all three picks are made — no "Calculate"
  // button. The whole point is "get a number in 10 seconds." A button is a
  // friction tax for an instant-feedback widget.
  useEffect(() => {
    if (!roomType || !size || !complexity) {
      setEstimate(null)
      return
    }
    const room = roomTypes.find((r) => r.value === roomType)
    const sizeOption = sizes.find((s) => s.value === size)
    const complexityOption = complexities.find((c) => c.value === complexity)
    if (!room || !sizeOption || !complexityOption) return

    let min = room.baseMin * sizeOption.multiplier * complexityOption.multiplier
    let max = room.baseMax * sizeOption.multiplier * complexityOption.multiplier
    if (needsDemo) {
      min += 500
      max += 1500
    }
    setEstimate({
      min: Math.round(min / 100) * 100,
      max: Math.round(max / 100) * 100,
    })
  }, [roomType, size, complexity, needsDemo])

  return (
    <div className={`bg-white rounded-2xl shadow-xl p-5 sm:p-8 ${className}`}>
      <div className="flex items-center gap-3 mb-5 sm:mb-6">
        <div className="w-11 h-11 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <Calculator className="w-6 h-6 text-primary-600" />
        </div>
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">Get a ballpark in 10 seconds</h3>
          <p className="text-gray-500 text-xs sm:text-sm">Tap your project — no contact info needed.</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Project type */}
        <Picker
          label="Project type"
          options={roomTypes.map((r) => ({ value: r.value, label: r.label, icon: r.icon }))}
          value={roomType}
          onChange={(v) => setRoomType(v as RoomKey)}
          columns={4}
        />

        {/* Size */}
        <Picker
          label="Size"
          options={sizes.map((s) => ({ value: s.value, label: s.label, sub: s.sub }))}
          value={size}
          onChange={setSize}
          columns={3}
        />

        {/* Complexity */}
        <Picker
          label="Complexity"
          options={complexities.map((c) => ({ value: c.value, label: c.label, sub: c.sub }))}
          value={complexity}
          onChange={setComplexity}
          columns={3}
        />

        {/* Demo toggle — single tap, large hit target */}
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

        {/* Result */}
        {estimate && (
          <div className="mt-4 p-5 sm:p-6 bg-primary-50 rounded-xl border border-primary-100">
            <p className="text-xs font-semibold text-primary-700 uppercase tracking-wider mb-2">
              Estimated range
            </p>
            <p className="text-2xl sm:text-3xl font-bold text-primary-900">
              ${estimate.min.toLocaleString()} – ${estimate.max.toLocaleString()}
            </p>
            <p className="text-xs sm:text-sm text-primary-700 mt-2">
              Rough ballpark. Final pricing requires photos or a site visit.
            </p>
            <Link
              href="/contact"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 active:scale-95 transition text-sm"
            >
              Get exact pricing
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {!estimate && (
          <p className="text-center text-xs text-gray-400">
            Pick all three to see your estimate.
          </p>
        )}
      </div>
    </div>
  )
}

// Generic tap-card picker. Shared shape for project type, size, complexity.
// Layout adapts: on phones we stay 2-column for legibility, hitting the
// configured columns at sm+ where there's room.
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
