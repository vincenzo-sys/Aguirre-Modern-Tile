'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles, X, Plus, Trash2 } from 'lucide-react'
import { toast } from '@/components/Toast'

// Template metadata fetched from /api/reference?table=job_templates. The
// modal needs sub_areas to know whether to render single or multi-sqft
// inputs and which keys to send back as sub_sqft.
type SubArea = {
  key: string
  label: string
  hint?: string
  default_share?: number
}

type Template = {
  template_name: string
  typical_sqft_low: number | null
  typical_sqft_high: number | null
  sub_areas: SubArea[] | null
}

// Fallback list shown until the API call returns. Matches the seed order
// from migration 002 so the dropdown looks identical pre/post-fetch.
const FALLBACK_TEMPLATE_NAMES = [
  'Backsplash (Standard)',
  'Backsplash (Large/Complex)',
  'Bathroom Floor (Small)',
  'Bathroom Floor (Medium)',
  'Fireplace Surround',
  'Shower Floor Only',
  'Standard Tub Surround',
  'Tub Surround + Bathroom Floor',
  'Walk-in Shower (Small)',
  'Walk-in Shower (Large)',
]

type ScopeInput = {
  uid: string  // local React key only — server assigns the real scope id
  label: string
  template_name: string
  // For templates with no sub_areas, sqft is the single input. For templates
  // with sub_areas, we ignore sqft and use sub_sqft below — but we still
  // show sqft as a "Total" derived field so the user can sanity-check.
  sqft: string
  // Per-area sqft strings, keyed by sub_area.key. Empty string = not yet
  // entered. Only populated when the selected template has sub_areas.
  sub_sqft: Record<string, string>
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

function defaultScope(template: string = FALLBACK_TEMPLATE_NAMES[0]): ScopeInput {
  return {
    uid: newUid(),
    label: '',
    template_name: template,
    sqft: '',
    sub_sqft: {},
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
  const [templates, setTemplates] = useState<Template[]>([])
  const [scopes, setScopes] = useState<ScopeInput[]>(() => [
    {
      ...defaultScope(initialTemplate ?? FALLBACK_TEMPLATE_NAMES[0]),
      sqft: initialSqft ? String(initialSqft) : '',
    },
  ])
  const [loading, setLoading] = useState(false)

  // Fetch live templates (with sub_areas metadata) the first time the modal
  // opens. Cached in component state across reopens since templates rarely
  // change. Falls back to FALLBACK_TEMPLATE_NAMES if the request fails so
  // the modal is never empty even when the API is down.
  useEffect(() => {
    if (!open || templates.length > 0) return
    fetch('/api/reference?table=job_templates')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Template[]) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]))
  }, [open, templates.length])

  // Reset scopes when reopening so a closed-then-reopened modal doesn't carry
  // stale entries from the previous interaction.
  useEffect(() => {
    if (open) {
      setScopes([
        {
          ...defaultScope(initialTemplate ?? FALLBACK_TEMPLATE_NAMES[0]),
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
        scopes: scopes.map((s, i) => {
          const tmpl = templates.find((t) => t.template_name === s.template_name)
          const subAreas = tmpl?.sub_areas ?? []
          const usingSubSqft = subAreas.length > 0
          // For sub-aware templates: send sub_sqft built from the keyed
          // inputs and let the engine derive the total. For simple
          // templates: keep sending a single sqft value.
          let payloadSqft: number | null = null
          let payloadSubSqft: Record<string, number> | undefined
          if (usingSubSqft) {
            const sub: Record<string, number> = {}
            for (const a of subAreas) {
              const raw = s.sub_sqft[a.key]
              if (raw && Number(raw) > 0) sub[a.key] = Number(raw)
            }
            if (Object.keys(sub).length > 0) payloadSubSqft = sub
            else payloadSqft = s.sqft ? Number(s.sqft) : null
          } else {
            payloadSqft = s.sqft ? Number(s.sqft) : null
          }
          return {
            label: fallbackLabel(s, i),
            template_name: s.template_name,
            sqft: payloadSqft,
            sub_sqft: payloadSubSqft,
            customer_provides: s.customer_provides_tile ? ['tile'] : [],
          }
        }),
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
                  templates={templates}
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
  templates,
  onPatch,
  onRemove,
}: {
  scope: ScopeInput
  index: number
  canRemove: boolean
  disabled: boolean
  templates: Template[]
  onPatch: (patch: Partial<ScopeInput>) => void
  onRemove: () => void
}) {
  // Use the live template if it's been fetched; otherwise fall back to the
  // hardcoded name list so the dropdown is never empty.
  const tmpl = templates.find((t) => t.template_name === scope.template_name)
  const subAreas = tmpl?.sub_areas ?? []
  const hasSubAreas = subAreas.length > 0
  const sqftHint =
    tmpl?.typical_sqft_low && tmpl?.typical_sqft_high
      ? `${tmpl.typical_sqft_low}-${tmpl.typical_sqft_high} sq ft`
      : null

  // Sum of sub-area inputs for the live "Total" badge — same number the
  // engine will compute server-side when it sums sub_sqft values.
  const subTotal = hasSubAreas
    ? subAreas.reduce((s, a) => s + (Number(scope.sub_sqft[a.key]) || 0), 0)
    : 0

  const templateNames =
    templates.length > 0 ? templates.map((t) => t.template_name) : FALLBACK_TEMPLATE_NAMES

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

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Template</label>
        <select
          value={scope.template_name}
          onChange={(e) => onPatch({ template_name: e.target.value, sub_sqft: {} })}
          disabled={disabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500"
        >
          {templateNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {sqftHint && (
          <p className="text-[10px] text-gray-400 mt-0.5">Typical: {sqftHint}</p>
        )}
      </div>

      {hasSubAreas ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-gray-700">
              Square footage by area
            </label>
            <span className="text-[11px] text-gray-500">
              Total: <strong className="text-gray-800">{subTotal || '—'}</strong> sq ft
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {subAreas.map((a) => (
              <div key={a.key}>
                <label className="block text-[11px] text-gray-600 mb-0.5">{a.label}</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={scope.sub_sqft[a.key] ?? ''}
                  onChange={(e) =>
                    onPatch({
                      sub_sqft: { ...scope.sub_sqft, [a.key]: e.target.value },
                    })
                  }
                  disabled={disabled}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500"
                />
                {a.hint && <p className="text-[10px] text-gray-400 mt-0.5">{a.hint}</p>}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400">
            Each area drives different materials (walls use GoBoard, floor uses cement board, etc.).
          </p>
        </div>
      ) : (
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
      )}

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
