'use client'

// EstimateDiffModal — "what changed between these two versions of the quote?"
//
// Opened from EstimateVersionHistory. The whole point is that Vince can answer
// a customer's "why did the price go up?" in the time it takes to open a phone,
// so the summary line (total delta) is the headline and the line-by-line detail
// sits underneath it.
//
// Rendering follows the customer estimate page's grouping rules: lines are
// bucketed by section with project-wide lines last, so the diff reads in the
// same order as the estimate it describes.

import { X, ArrowRight, Plus, Minus, RefreshCw } from 'lucide-react'
import {
  diffEstimates,
  groupDiffBySection,
  type ChangedLineItem,
} from '@/lib/estimator/diffEstimates'
import type { JobEstimateVersion } from '@/lib/estimateVersions'
import type { JobLineItem } from '@/lib/supabase/types'

type Props = {
  open: boolean
  onClose: () => void
  before: JobEstimateVersion | null
  after: JobEstimateVersion | null
}

function money(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n)
}

function signed(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${money(Math.abs(n))}`
}

function qty(item: JobLineItem): string {
  return `${item.quantity} ${item.unit}`
}

export default function EstimateDiffModal({ open, onClose, before, after }: Props) {
  if (!open || !before || !after) return null

  const diff = diffEstimates(before, after)
  const groups = groupDiffBySection(diff)

  // Up is red, down is green — this is a cost to the customer, not revenue.
  const deltaTone =
    diff.totalDelta > 0
      ? 'text-red-700 bg-red-50 border-red-200'
      : diff.totalDelta < 0
        ? 'text-green-700 bg-green-50 border-green-200'
        : 'text-gray-600 bg-gray-50 border-gray-200'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900">What changed</h3>
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
              <span>v{before.version}</span>
              <ArrowRight className="w-3 h-3" />
              <span>
                v{after.version}
                {after.is_current && ' (current)'}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-100 shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Headline: the number the customer actually asked about. */}
          <div className={`rounded-lg border px-4 py-3 ${deltaTone}`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm">
                <span className="text-gray-500 line-through">{money(diff.totalBefore)}</span>
                <ArrowRight className="w-3 h-3 inline mx-2" />
                <span className="font-semibold">{money(diff.totalAfter)}</span>
              </div>
              <div className="text-lg font-bold">{signed(diff.totalDelta)}</div>
            </div>
            {diff.daysDelta !== 0 && (
              <p className="text-xs mt-1.5">
                Install time {diff.daysBefore ?? '—'} → {diff.daysAfter ?? '—'} days (
                {diff.daysDelta > 0 ? '+' : ''}
                {diff.daysDelta})
              </p>
            )}
          </div>

          {diff.isEmpty ? (
            <p className="text-sm text-gray-500 text-center py-6">
              Nothing changed between these two versions.
            </p>
          ) : groups.length === 0 ? (
            // Total moved but no line item did — a hand-edited flat quote.
            <p className="text-sm text-gray-500 text-center py-6">
              The total was adjusted directly — no individual line items changed.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.section || '__project'} className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {g.section || 'Project-wide'}
                </h4>

                {g.added.map((item, i) => (
                  <Row
                    key={`a${i}`}
                    icon={<Plus className="w-3.5 h-3.5" />}
                    tone="bg-green-50 border-green-200 text-green-800"
                    label={item.description}
                    detail={`Added · ${qty(item)}`}
                    amount={signed(Number(item.amount) || 0)}
                  />
                ))}

                {g.removed.map((item, i) => (
                  <Row
                    key={`r${i}`}
                    icon={<Minus className="w-3.5 h-3.5" />}
                    tone="bg-red-50 border-red-200 text-red-800"
                    label={item.description}
                    detail={`Removed · ${qty(item)}`}
                    amount={signed(-(Number(item.amount) || 0))}
                  />
                ))}

                {g.changed.map((c, i) => (
                  <Row
                    key={`c${i}`}
                    icon={<RefreshCw className="w-3.5 h-3.5" />}
                    tone="bg-amber-50 border-amber-200 text-amber-900"
                    label={c.after.description}
                    detail={changeDetail(c)}
                    amount={signed(c.amountDelta)}
                  />
                ))}
              </div>
            ))
          )}

          {diff.unchangedCount > 0 && (
            <p className="text-xs text-gray-400 text-center pt-1">
              {diff.unchangedCount} other line{diff.unchangedCount === 1 ? '' : 's'} unchanged
            </p>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-5 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

/** Spell out which dimension moved, so "why" is visible without mental math. */
function changeDetail(c: ChangedLineItem): string {
  const parts: string[] = []
  if (c.quantityDelta !== 0 || c.before.unit !== c.after.unit) {
    parts.push(`${qty(c.before)} → ${qty(c.after)}`)
  }
  if (c.unitPriceDelta !== 0) {
    parts.push(`${money(Number(c.before.unit_price) || 0)} → ${money(Number(c.after.unit_price) || 0)} each`)
  }
  return parts.length > 0 ? parts.join(' · ') : 'Amount adjusted'
}

function Row({
  icon,
  tone,
  label,
  detail,
  amount,
}: {
  icon: React.ReactNode
  tone: string
  label: string
  detail: string
  amount: string
}) {
  return (
    <div className={`flex items-start gap-2.5 rounded-md border px-3 py-2 ${tone}`}>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium break-words">{label}</p>
        <p className="text-xs opacity-80 mt-0.5">{detail}</p>
      </div>
      <div className="text-sm font-semibold whitespace-nowrap shrink-0">{amount}</div>
    </div>
  )
}
