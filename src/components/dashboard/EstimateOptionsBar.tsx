'use client'

// EstimateOptionsBar — the Good/Better/Best switcher above the line items.
//
// Sales logic this exists to serve: presenting tiers moves the customer's
// question from "yes or no?" to "which one?". The Premium column doesn't have
// to sell often — it makes the middle option feel reasonable.
//
// Mechanically, exactly ONE option is "active" (is_primary) at a time. That is
// the one mirrored onto jobs.*, which the Stripe deposit, invoicing and the
// crew work order all read. Editing a non-active option is therefore safe: it
// changes nothing downstream until it's made active or the customer picks it.

import { useState } from 'react'
import { Plus, Star, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react'
import { toast } from '@/components/Toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import type { JobEstimateVersion } from '@/lib/estimateVersions'

function money(n: number | string | null): string {
  const v = Number(n ?? 0)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(Number.isFinite(v) ? v : 0)
}

export default function EstimateOptionsBar({
  jobId,
  options,
  activeKey,
  onSelect,
  onChanged,
}: {
  jobId: string
  options: JobEstimateVersion[]
  /** Which option the editors below are pointed at. */
  activeKey: string
  onSelect: (optionKey: string) => void
  /** Re-fetch options + job after any mutation. */
  onChanged: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const active = options.find((o) => o.option_key === activeKey) ?? options[0]

  async function call(url: string, init: RequestInit, okMessage: string) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Something went wrong')
    }
    toast(okMessage, 'success')
    await onChanged()
    return res
  }

  async function handleAdd() {
    const label = newLabel.trim()
    if (!label) {
      toast('Give the option a name — customers see it', 'error')
      return
    }
    setBusy('add')
    try {
      // Duplicates the active option server-side: nobody builds Premium from
      // scratch, they build it by swapping the tile on Standard.
      const res = await call(
        `/api/jobs/${jobId}/estimate-options`,
        { method: 'POST', body: JSON.stringify({ label, copy_from_option_key: activeKey }) },
        `Added "${label}"`
      )
      const data = await res.json()
      setAdding(false)
      setNewLabel('')
      if (data.option?.option_key) onSelect(data.option.option_key)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not add option', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleRename(o: JobEstimateVersion) {
    const label = renameValue.trim()
    if (!label || label === o.label) {
      setRenaming(null)
      return
    }
    setBusy(o.id)
    try {
      await call(
        `/api/jobs/${jobId}/estimate-options/${o.id}`,
        { method: 'PATCH', body: JSON.stringify({ label }) },
        'Renamed'
      )
      setRenaming(null)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Rename failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleMakePrimary(o: JobEstimateVersion) {
    if (
      !(await confirmDialog({
        title: `Make "${o.label}" the active option?`,
        message: `The job's price becomes ${money(o.estimated_cost)}. This is what the invoice, the deposit, and the crew work order will use.`,
        confirmLabel: 'Make active',
      }))
    )
      return

    setBusy(o.id)
    try {
      await call(
        `/api/jobs/${jobId}/estimate-options/${o.id}`,
        { method: 'PATCH', body: JSON.stringify({ make_primary: true }) },
        `"${o.label}" is now the active option`
      )
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not switch option', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleDelete(o: JobEstimateVersion) {
    if (
      !(await confirmDialog({
        title: `Delete "${o.label}"?`,
        message: 'This option and its entire revision history are removed. This one cannot be undone.',
        tone: 'danger',
        confirmLabel: 'Delete',
      }))
    )
      return

    setBusy(o.id)
    try {
      await call(
        `/api/jobs/${jobId}/estimate-options/${o.id}`,
        { method: 'DELETE' },
        `Deleted "${o.label}"`
      )
      const fallback = options.find((x) => x.option_key !== o.option_key)
      if (fallback) onSelect(fallback.option_key)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete option', 'error')
    } finally {
      setBusy(null)
    }
  }

  if (options.length === 0) return null

  // A single unnamed option is just "the estimate" — showing a one-tab
  // switcher would be visual noise, so collapse to a bare Add control.
  const isSingle = options.length === 1

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {isSingle ? 'Pricing' : `Options (${options.length})`}
        </h3>
        {!adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true)
              setNewLabel('')
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            <Plus className="w-3.5 h-3.5" />
            {isSingle ? 'Offer a second option' : 'Add option'}
          </button>
        )}
      </div>

      {adding && (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') setAdding(false)
            }}
            placeholder="Upgraded"
            className="flex-1 min-w-0 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={busy === 'add'}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            {busy === 'add' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Add
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="p-1.5 rounded-md hover:bg-gray-100"
            aria-label="Cancel"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      )}

      {!isSingle && (
        // Horizontal scroll rather than wrap: Christian and Vince both work
        // this screen from a phone, and a wrapping tab row reflows the whole
        // card every time a price changes.
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
          {options.map((o) => {
            const isActive = o.option_key === activeKey
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onSelect(o.option_key)}
                className={`shrink-0 text-left px-3 py-2 rounded-lg border transition-colors ${
                  isActive
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-sm font-semibold ${isActive ? 'text-primary-900' : 'text-gray-700'}`}
                  >
                    {o.label}
                  </span>
                  {o.is_primary && (
                    <Star className="w-3 h-3 text-amber-500 fill-amber-500" aria-label="Active option" />
                  )}
                  {o.selected_at && (
                    <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-1 rounded">
                      PICKED
                    </span>
                  )}
                </div>
                <div className={`text-xs mt-0.5 ${isActive ? 'text-primary-700' : 'text-gray-500'}`}>
                  {money(o.estimated_cost)}
                  {o.estimated_days ? ` · ${o.estimated_days}d` : ''}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Actions for whichever option is being edited. */}
      {active && !isSingle && (
        <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
          {renaming === active.id ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(active)
                  if (e.key === 'Escape') setRenaming(null)
                }}
                className="flex-1 min-w-0 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                type="button"
                onClick={() => handleRename(active)}
                className="text-xs font-medium text-primary-600 hover:text-primary-700"
              >
                Save
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setRenaming(active.id)
                  setRenameValue(active.label)
                }}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-700 pt-1.5"
              >
                <Pencil className="w-3 h-3" />
                Rename
              </button>

              {!active.is_primary && (
                <button
                  type="button"
                  onClick={() => handleMakePrimary(active)}
                  disabled={busy === active.id}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:text-amber-800 pt-1.5 disabled:opacity-50"
                >
                  {busy === active.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Star className="w-3 h-3" />
                  )}
                  Make active
                </button>
              )}

              {!active.is_primary && !active.selected_at && (
                <button
                  type="button"
                  onClick={() => handleDelete(active)}
                  disabled={busy === active.id}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 hover:text-red-700 pt-1.5 disabled:opacity-50 ml-auto"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      )}

      {active && !active.is_primary && (
        <p className="text-[11px] text-gray-500 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          You&apos;re editing <strong>{active.label}</strong>, which isn&apos;t the active option. The
          job total, invoice and crew work order still use{' '}
          <strong>{options.find((o) => o.is_primary)?.label ?? 'the active option'}</strong>.
        </p>
      )}
    </div>
  )
}
