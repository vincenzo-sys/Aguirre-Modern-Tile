'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles, X, Plus, Trash2 } from 'lucide-react'
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
] as const

type ScopeInput = {
  uid: string  // local React key only — server assigns the real scope id
  label: string
  template_name: string
  sqft: string
  customer_provides_tile: boolean
}

type Result = {
  total: number
  deposit: number
  labor_days: number
  margin_percent: number
  line_item_count: number
  scope_count: number
}

let uidCounter = 0
function newUid(): string {
  uidCounter += 1
  return `s${uidCounter}_${Date.now()}`
}

function defaultScope(template: string = TEMPLATES[0].name): ScopeInput {
  return {
    uid: newUid(),
    label: '',
    template_name: template,
    sqft: '',
    customer_provides_tile: true,
  }
}

// Auto-generated label when the user hasn't typed one. Mirrors what the
// server does, so the preview here matches what shows up on the estimate.
function fallbackLabel(scope: ScopeInput, index: number): string {
  return scope.label.trim() || `${scope.template_name} #${index + 1}`
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
  const [scopes, setScopes] = useState<ScopeInput[]>(() => [
    {
      ...defaultScope(initialTemplate ?? TEMPLATES[0].name),
      sqft: initialSqft ? String(initialSqft) : '',
    },
  ])
  const [loading, setLoading] = useState(false)

  // Reset scopes when reopening so a closed-then-reopened modal doesn't carry
  // stale entries from the previous interaction.
  useEffect(() => {
    if (open) {
      setScopes([
        {
          ...defaultScope(initialTemplate ?? TEMPLATES[0].name),
          sqft: initialSqft ? String(initialSqft) : '',
        },
      ])
    }
  }, [open, initialTemplate, initialSqft])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  function updateScope(uid: string, patch: Partial<ScopeInput>) {
    setScopes((prev) => prev.map((s) => (s.uid === uid ? { ...s, ...patch } : s)))
  }

  function addScope() {
    setScopes((prev) => [...prev, defaultScope()])
  }

  function removeScope(uid: string) {
    setScopes((prev) => (prev.length === 1 ? prev : prev.filter((s) => s.uid !== uid)))
  }

  async function handleGenerate() {
    setLoading(true)
    try {
      const body = {
        job_id: jobId,
        overwrite: hasExistingItems,
        scopes: scopes.map((s, i) => ({
          label: fallbackLabel(s, i),
          template_name: s.template_name,
          sqft: s.sqft ? Number(s.sqft) : null,
          customer_provides: s.customer_provides_tile ? ['tile'] : [],
        })),
      }
      const res = await fetch('/api/estimates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate estimate')
      const s: Result = data.summary
      const scopeText = s.scope_count > 1 ? `${s.scope_count} scopes` : '1 scope'
      toast(
        `Estimate: $${s.total.toFixed(2)} · ${scopeText} · ${s.labor_days}d · ${s.margin_percent}% margin`,
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

  const isMulti = scopes.length > 1

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
          <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {hasExistingItems ? 'Regenerate estimate' : 'Generate estimate'}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Add one scope per area. Multi-scope jobs render as sectioned subtotals on the customer estimate.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {scopes.map((scope, idx) => (
                <ScopeCard
                  key={scope.uid}
                  scope={scope}
                  index={idx}
                  canRemove={scopes.length > 1}
                  disabled={loading}
                  onPatch={(patch) => updateScope(scope.uid, patch)}
                  onRemove={() => removeScope(scope.uid)}
                />
              ))}

              <button
                type="button"
                onClick={addScope}
                disabled={loading}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary-700 border border-dashed border-primary-300 rounded-md hover:bg-primary-50 disabled:opacity-50 w-full justify-center"
              >
                <Plus className="w-4 h-4" />
                Add another scope
              </button>

              {hasExistingItems && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs text-amber-900">
                    <strong>Heads up:</strong> this job already has line items.
                    Generating will replace them. Material status (ordered/received) is reset on items that change.
                  </p>
                </div>
              )}

              {isMulti && (
                <div className="rounded-md bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600">
                  <strong className="text-gray-800">Tip:</strong> name each scope clearly
                  (&ldquo;Master Bath&rdquo;, &ldquo;Guest Bath&rdquo;) — those names become the section
                  headers the customer sees.
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between sticky bottom-0 bg-white">
              <div className="text-xs text-gray-500">
                {scopes.length} scope{scopes.length === 1 ? '' : 's'}
              </div>
              <div className="flex items-center gap-3">
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
        </div>
      )}
    </>
  )
}

function ScopeCard({
  scope,
  index,
  canRemove,
  disabled,
  onPatch,
  onRemove,
}: {
  scope: ScopeInput
  index: number
  canRemove: boolean
  disabled: boolean
  onPatch: (patch: Partial<ScopeInput>) => void
  onRemove: () => void
}) {
  const tmpl = TEMPLATES.find((t) => t.name === scope.template_name)
  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-white">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Scope {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
            title="Remove scope"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Name (shown on estimate)</label>
        <input
          type="text"
          value={scope.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          disabled={disabled}
          placeholder={`e.g. Master Bath, Guest Bath, Kitchen`}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Template</label>
          <select
            value={scope.template_name}
            onChange={(e) => onPatch({ template_name: e.target.value })}
            disabled={disabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500"
          >
            {TEMPLATES.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
          {tmpl && (
            <p className="text-[10px] text-gray-400 mt-0.5">Typical: {tmpl.sqftHint}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Square footage</label>
          <input
            type="number"
            min={0}
            step={1}
            value={scope.sqft}
            onChange={(e) => onPatch({ sqft: e.target.value })}
            disabled={disabled}
            placeholder="e.g. 75"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500"
          />
          <p className="text-[10px] text-gray-400 mt-0.5">Drives material qty via formulas</p>
        </div>
      </div>

      <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={scope.customer_provides_tile}
          onChange={(e) => onPatch({ customer_provides_tile: e.target.checked })}
          disabled={disabled}
          className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        <span>Customer provides the tile for this scope</span>
      </label>
    </div>
  )
}
