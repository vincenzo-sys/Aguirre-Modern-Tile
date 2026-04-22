'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles, X } from 'lucide-react'
import { toast } from '@/components/Toast'

const TEMPLATES = [
  { name: 'Backsplash (Standard)', sqftHint: '20-35 sq ft' },
  { name: 'Backsplash (Large/Complex)', sqftHint: '35-60 sq ft' },
  { name: 'Bathroom Floor (Small)', sqftHint: '25-40 sq ft' },
  { name: 'Bathroom Floor (Medium)', sqftHint: '50-80 sq ft' },
  { name: 'Fireplace Surround', sqftHint: '20-40 sq ft' },
  { name: 'Shower Floor Only', sqftHint: '12-25 sq ft' },
  { name: 'Standard Tub Surround', sqftHint: '70-90 sq ft' },
  { name: 'Tub Surround + Bathroom Floor', sqftHint: '100-130 sq ft' },
  { name: 'Walk-in Shower (Small)', sqftHint: '100-130 sq ft' },
  { name: 'Walk-in Shower (Large)', sqftHint: '150-200 sq ft' },
]

type Result = {
  total: number
  deposit: number
  labor_days: number
  margin_percent: number
  line_item_count: number
}

export default function GenerateEstimateModal({
  jobId,
  hasExistingItems,
  initialSqft,
  initialTemplate,
}: {
  jobId: string
  hasExistingItems: boolean
  initialSqft?: number | null
  initialTemplate?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [template, setTemplate] = useState(initialTemplate ?? TEMPLATES[0].name)
  const [sqft, setSqft] = useState<string>(initialSqft ? String(initialSqft) : '')
  const [customerProvidesTile, setCustomerProvidesTile] = useState(true)
  const [loading, setLoading] = useState(false)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  async function handleGenerate() {
    setLoading(true)
    try {
      const body = {
        job_id: jobId,
        template_name: template,
        sqft: sqft ? Number(sqft) : null,
        customer_provides: customerProvidesTile ? ['tile'] : [],
        overwrite: hasExistingItems,
      }
      const res = await fetch('/api/estimates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate estimate')
      const s: Result = data.summary
      toast(
        `Estimate generated: $${s.total.toFixed(2)} (${s.labor_days}d, ${s.margin_percent}% margin, ${s.line_item_count} items)`,
        'success'
      )
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Generation failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        {hasExistingItems ? 'Regenerate estimate' : 'Generate estimate'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div
            className="fixed inset-0"
            onClick={() => !loading && setOpen(false)}
            aria-hidden
          />
          <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {hasExistingItems ? 'Regenerate estimate' : 'Generate estimate'}
              </h2>
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Template
                </label>
                <select
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  disabled={loading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500"
                >
                  {TEMPLATES.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name} — {t.sqftHint}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Seeds labor + materials from our catalog. You can edit line items after.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Square footage <span className="text-gray-400">(optional, overrides template default)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={sqft}
                  onChange={(e) => setSqft(e.target.value)}
                  disabled={loading}
                  placeholder="e.g. 75"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div>
                <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customerProvidesTile}
                    onChange={(e) => setCustomerProvidesTile(e.target.checked)}
                    disabled={loading}
                    className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span>
                    Customer is providing the tile
                    <span className="block text-xs text-gray-500">
                      Leave checked unless we&apos;re sourcing the tile ourselves.
                    </span>
                  </span>
                </label>
              </div>

              {hasExistingItems && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs text-amber-900">
                    <strong>Heads up:</strong> this job already has line items.
                    Generating will replace them. Any manual edits will be lost.
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
