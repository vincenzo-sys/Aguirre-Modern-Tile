'use client'

import { useState } from 'react'
import { Calculator, ArrowRight } from 'lucide-react'

const roomTypes = [
  { value: 'bathroom', label: 'Full Bathroom', baseMin: 4500, baseMax: 8000 },
  { value: 'shower', label: 'Shower Only', baseMin: 2500, baseMax: 5000 },
  { value: 'floor', label: 'Floor Only', baseMin: 1500, baseMax: 4000 },
  { value: 'backsplash', label: 'Backsplash', baseMin: 800, baseMax: 2000 },
]

const sizes = [
  { value: 'small', label: 'Small (<50 sq ft)', multiplier: 1 },
  { value: 'medium', label: 'Medium (50-100 sq ft)', multiplier: 1.5 },
  { value: 'large', label: 'Large (100+ sq ft)', multiplier: 2.2 },
]

const complexities = [
  { value: 'standard', label: 'Standard', multiplier: 1 },
  { value: 'moderate', label: 'Moderate (patterns, niches)', multiplier: 1.3 },
  { value: 'complex', label: 'Complex (custom work)', multiplier: 1.6 },
]

export default function QuoteCalculator() {
  const [roomType, setRoomType] = useState('')
  const [size, setSize] = useState('')
  const [complexity, setComplexity] = useState('')
  const [needsDemo, setNeedsDemo] = useState(false)
  const [estimate, setEstimate] = useState<{ min: number; max: number } | null>(null)

  const calculateEstimate = () => {
    if (!roomType || !size || !complexity) return

    const room = roomTypes.find(r => r.value === roomType)
    const sizeOption = sizes.find(s => s.value === size)
    const complexityOption = complexities.find(c => c.value === complexity)

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
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
          <Calculator className="w-6 h-6 text-primary-600" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">Quick Quote Calculator</h3>
          <p className="text-gray-500 text-sm">Get an instant ballpark estimate</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Room Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Project Type
          </label>
          <select
            value={roomType}
            onChange={(e) => setRoomType(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">Select project type...</option>
            {roomTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Size */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Size
          </label>
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">Select size...</option>
            {sizes.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Complexity */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Complexity
          </label>
          <select
            value={complexity}
            onChange={(e) => setComplexity(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">Select complexity...</option>
            {complexities.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Demo Needed */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="demo"
            checked={needsDemo}
            onChange={(e) => setNeedsDemo(e.target.checked)}
            className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
          />
          <label htmlFor="demo" className="text-gray-700">
            Demo/removal needed
          </label>
        </div>

        {/* Calculate Button */}
        <button
          onClick={calculateEstimate}
          disabled={!roomType || !size || !complexity}
          className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Calculate Estimate
        </button>

        {/* Result */}
        {estimate && (
          <div className="mt-6 p-6 bg-primary-50 rounded-xl">
            <p className="text-sm text-primary-700 mb-2">Estimated Range:</p>
            <p className="text-3xl font-bold text-primary-900">
              ${estimate.min.toLocaleString()} - ${estimate.max.toLocaleString()}
            </p>
            <p className="text-sm text-primary-600 mt-2">
              *This is a rough estimate. Final pricing requires photos or site visit.
            </p>
            <a
              href="/contact"
              className="inline-flex items-center gap-2 mt-4 text-primary-700 font-semibold hover:text-primary-800"
            >
              Want exact pricing? Upload photos
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
