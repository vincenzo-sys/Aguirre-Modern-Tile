'use client'

import { useState, useMemo } from 'react'
import { Plus, X, Save, Loader2, Code } from 'lucide-react'
import { toast } from '@/components/Toast'
import {
  parseScopeNotes,
  serializeScopeNotes,
  type StructuredScope,
} from '@/lib/scopeNotes'

// 5-section structured editor that round-trips through `jobs.scope_notes`.
// Each input maps directly to a known location on the customer-facing
// estimate page, so the user never has to remember magic header strings.
//
// On mount, parses the existing scope_notes into structured fields. On save,
// serializes back to the canonical text format (SCOPE OF WORK / WARRANTY /
// WHAT'S INCLUDED / WHAT'S NOT INCLUDED / PAYMENT) and PATCHes the job.
// Backward compatible — legacy hand-typed scopes still parse cleanly.

interface Props {
  jobId: string
  initialScopeNotes: string | null | undefined
  onSaved?: (newNotes: string) => void
}

type EditorState = {
  scopeOfWork: string
  warranty: string
  included: string[]
  notIncluded: string[]
  additionalNotes: string
}

function toEditorState(parsed: StructuredScope): EditorState {
  return {
    scopeOfWork: parsed.scopeOfWork,
    warranty: parsed.warranty,
    included: parsed.included.length > 0 ? parsed.included : [''],
    notIncluded: parsed.notIncluded.length > 0 ? parsed.notIncluded : [''],
    additionalNotes: parsed.additionalNotes,
  }
}

export default function StructuredScopeEditor({ jobId, initialScopeNotes, onSaved }: Props) {
  const initialParsed = useMemo(() => parseScopeNotes(initialScopeNotes), [initialScopeNotes])
  const [state, setState] = useState<EditorState>(() => toEditorState(initialParsed))
  const [saving, setSaving] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  // Live-serialized preview — used for the raw-text panel and as the payload
  // when saving. Kept reactive so toggling Show Raw always reflects current
  // state.
  const serialized = useMemo(
    () =>
      serializeScopeNotes({
        scopeOfWork: state.scopeOfWork,
        warranty: state.warranty,
        included: state.included.filter((b) => b.trim().length > 0),
        notIncluded: state.notIncluded.filter((b) => b.trim().length > 0),
        additionalNotes: state.additionalNotes,
      }),
    [state]
  )

  const isDirty = serialized !== (initialScopeNotes ?? '').trim()

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope_notes: serialized }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to save')
      }
      toast('Scope saved · live on customer estimate', 'success')
      onSaved?.(serialized)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  function setIncluded(idx: number, value: string) {
    setState((s) => {
      const next = [...s.included]
      next[idx] = value
      return { ...s, included: next }
    })
  }
  function addIncluded() {
    setState((s) => ({ ...s, included: [...s.included, ''] }))
  }
  function removeIncluded(idx: number) {
    setState((s) => {
      const next = s.included.filter((_, i) => i !== idx)
      return { ...s, included: next.length > 0 ? next : [''] }
    })
  }

  function setNotIncluded(idx: number, value: string) {
    setState((s) => {
      const next = [...s.notIncluded]
      next[idx] = value
      return { ...s, notIncluded: next }
    })
  }
  function addNotIncluded() {
    setState((s) => ({ ...s, notIncluded: [...s.notIncluded, ''] }))
  }
  function removeNotIncluded(idx: number) {
    setState((s) => {
      const next = s.notIncluded.filter((_, i) => i !== idx)
      return { ...s, notIncluded: next.length > 0 ? next : [''] }
    })
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-900">Customer-facing scope</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRaw(!showRaw)}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            title="Show the canonical text that gets saved to scope_notes"
          >
            <Code className="w-3 h-3" />
            {showRaw ? 'Hide raw' : 'Show raw'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {saving ? 'Saving' : isDirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Each section below maps to a known spot on the customer&apos;s estimate page. Type once, it lands in the right place.
      </p>

      {!initialParsed.isStructured && initialScopeNotes && initialScopeNotes.trim() && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Legacy scope detected. The existing text is loaded into <strong>Scope of work</strong>. Splitting it into the structured sections below will give the customer a cleaner read.
        </div>
      )}

      <div className="space-y-5">
        <Field
          label="Scope of work"
          helper="Free-form description of what's getting installed. Renders as the project body on the customer estimate."
        >
          <textarea
            rows={8}
            value={state.scopeOfWork}
            onChange={(e) => setState({ ...state, scopeOfWork: e.target.value })}
            placeholder="Bathroom remodel with customer-provided tile. Tub retained..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
          />
        </Field>

        <Field
          label="Warranty"
          helper="Renders as the warranty callout (with shield icon) on the customer estimate. Mention an N-year period and we'll auto-detect it for the trust band."
        >
          <textarea
            rows={3}
            value={state.warranty}
            onChange={(e) => setState({ ...state, warranty: e.target.value })}
            placeholder="3-year warranty on all installation labor. If tile cracks, loosens, or grout fails due to installation defects within 3 years of completion, we repair at no cost."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
          />
        </Field>

        <BulletField
          label="What's included"
          helper="Renders as the green check-list on the customer estimate."
          items={state.included}
          onSet={setIncluded}
          onAdd={addIncluded}
          onRemove={removeIncluded}
          addLabel="Add included item"
          placeholder="e.g., Demo, waterproofing, tile installation"
        />

        <BulletField
          label="What's not included"
          helper="Renders as the gray dash-list on the customer estimate. Use this to set boundaries (e.g., customer-provided tile, plumbing fixtures)."
          items={state.notIncluded}
          onSet={setNotIncluded}
          onAdd={addNotIncluded}
          onRemove={removeNotIncluded}
          addLabel="Add not-included item"
          placeholder="e.g., Tile (you provide), plumbing fixtures, paint"
        />

        <Field
          label="Additional notes"
          helper="Free-form policy paragraphs (no-extra-charges if longer, special-case rules, etc.). Renders as an Additional Notes block under the deposit on the customer estimate."
        >
          <textarea
            rows={4}
            value={state.additionalNotes}
            onChange={(e) => setState({ ...state, additionalNotes: e.target.value })}
            placeholder="If the scope of work takes longer than estimated, no additional charges. Customer responsible for plumbing fixtures..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
          />
        </Field>
      </div>

      {showRaw && (
        <div className="mt-5">
          <p className="text-xs font-medium text-gray-500 mb-1">Raw scope_notes (read-only preview)</p>
          <pre className="text-xs font-mono bg-gray-50 border border-gray-200 rounded p-3 whitespace-pre-wrap text-gray-700 max-h-64 overflow-auto">
            {serialized || '(empty)'}
          </pre>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  helper,
  children,
}: {
  label: string
  helper: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-900 mb-0.5">{label}</label>
      <p className="text-xs text-gray-500 mb-1.5">{helper}</p>
      {children}
    </div>
  )
}

function BulletField({
  label,
  helper,
  items,
  onSet,
  onAdd,
  onRemove,
  addLabel,
  placeholder,
}: {
  label: string
  helper: string
  items: string[]
  onSet: (idx: number, value: string) => void
  onAdd: () => void
  onRemove: (idx: number) => void
  addLabel: string
  placeholder: string
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-900 mb-0.5">{label}</label>
      <p className="text-xs text-gray-500 mb-1.5">{helper}</p>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-gray-400 text-sm select-none">&#8226;</span>
            <input
              type="text"
              value={item}
              onChange={(e) => onSet(idx, e.target.value)}
              placeholder={placeholder}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              type="button"
              onClick={() => onRemove(idx)}
              aria-label="Remove item"
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 text-sm text-primary-700 hover:text-primary-800 font-medium"
        >
          <Plus className="w-4 h-4" />
          {addLabel}
        </button>
      </div>
    </div>
  )
}
