'use client'

// EstimateVersionHistory — every revision of this job's quote, newest first.
//
// Before migration 048 this data did not exist: re-pricing a job overwrote
// jobs.line_items in place, so "what did we quote them last week?" had no
// answer. Each row here is an immutable snapshot, so the delta chips are real
// history rather than a reconstruction.
//
// Card styling matches CustomerTimeline (the other "history" surface in the
// dashboard) so the two read as the same kind of object.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { History, Loader2, RotateCcw, GitCompare, ChevronDown } from 'lucide-react'
import { toast } from '@/components/Toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import EstimateDiffModal from './EstimateDiffModal'
import type { JobEstimateVersion } from '@/lib/estimateVersions'

const INITIAL_VISIBLE = 5

function money(n: number | string | null): string {
  const v = Number(n ?? 0)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(Number.isFinite(v) ? v : 0)
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function EstimateVersionHistory({
  jobId,
  isOwner,
  refreshKey = 0,
  onRestored,
}: {
  jobId: string
  isOwner: boolean
  /** Bump to re-fetch after the estimate is edited elsewhere on the page. */
  refreshKey?: number
  onRestored?: () => void
}) {
  const router = useRouter()
  const [versions, setVersions] = useState<JobEstimateVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [compare, setCompare] = useState<JobEstimateVersion | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/estimate-versions`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Could not load history')
      const data = await res.json()
      setVersions(data.versions ?? [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  async function handleRestore(v: JobEstimateVersion) {
    if (
      !(await confirmDialog({
        title: `Restore v${v.version}?`,
        message: `The estimate goes back to ${money(v.estimated_cost)}. Nothing is deleted — this is recorded as a new version, so the current pricing stays in the history.`,
        confirmLabel: 'Restore',
      }))
    )
      return

    setRestoringId(v.id)
    try {
      const res = await fetch(`/api/jobs/${jobId}/estimate-versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version_id: v.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Restore failed')
      }
      toast(`Restored v${v.version}`, 'success')
      await load()
      onRestored?.()
      router.refresh()
    } catch (err) {
      console.error(err)
      toast(err instanceof Error ? err.message : 'Restore failed', 'error')
    } finally {
      setRestoringId(null)
    }
  }

  // Nothing to show until a job has been priced at least once. Staying silent
  // beats an empty card on every brand-new lead.
  if (loading || versions.length === 0) return null

  const current = versions.find((v) => v.is_current) ?? versions[0]
  const visible = expanded ? versions : versions.slice(0, INITIAL_VISIBLE)

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <History className="w-4 h-4" />
            Quote history ({versions.length})
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Every revision of this estimate, newest first. Nothing is ever overwritten.
          </p>
        </div>

        <ol className="divide-y divide-gray-100">
          {visible.map((v, i) => {
            // Compare against the next-older revision of the SAME option, so a
            // multi-option job doesn't show nonsense deltas across options.
            const prev = versions
              .slice(i + 1)
              .find((p) => p.option_key === v.option_key)
            const delta = prev
              ? Number(v.estimated_cost ?? 0) - Number(prev.estimated_cost ?? 0)
              : null

            return (
              <li key={v.id} className="flex items-start gap-3 px-5 py-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                    v.is_current
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  v{v.version}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900">
                      {money(v.estimated_cost)}
                      {v.is_current && (
                        <span className="ml-2 text-[11px] font-semibold text-primary-600 uppercase tracking-wide">
                          Current
                        </span>
                      )}
                      {delta !== null && delta !== 0 && (
                        <span
                          className={`ml-2 text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                            delta > 0
                              ? 'bg-red-50 text-red-700'
                              : 'bg-green-50 text-green-700'
                          }`}
                        >
                          {delta > 0 ? '+' : '−'}
                          {money(Math.abs(delta))}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 whitespace-nowrap">
                      {fmtDateTime(v.created_at)}
                    </p>
                  </div>

                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {v.author_name ?? 'Unknown'}
                    {v.change_note ? ` · ${v.change_note}` : ''}
                    {versions.some((o) => o.option_key !== v.option_key) ? ` · ${v.label}` : ''}
                  </p>

                  {!v.is_current && (
                    <div className="flex items-center gap-3 mt-1.5">
                      <button
                        type="button"
                        onClick={() => setCompare(v)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-700"
                      >
                        <GitCompare className="w-3 h-3" />
                        Compare to current
                      </button>
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => handleRestore(v)}
                          disabled={restoringId === v.id}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
                        >
                          {restoringId === v.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3" />
                          )}
                          Restore
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>

        {versions.length > INITIAL_VISIBLE && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="w-full px-5 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50 border-t border-gray-100 flex items-center justify-center gap-1"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            {expanded ? 'Show less' : `Show all ${versions.length}`}
          </button>
        )}
      </div>

      <EstimateDiffModal
        open={compare !== null}
        onClose={() => setCompare(null)}
        before={compare}
        after={current}
      />
    </>
  )
}
