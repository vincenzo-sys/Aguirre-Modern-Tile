'use client'

// StagePickerSheet — a mobile-first bottom sheet for picking a pipeline
// stage. The old chip-dropdown was 22px tall with 11px text; on a phone
// it was nearly impossible to hit, and Vince told us so directly ("for
// some reason changing status is too hard"). This sheet gives each
// option a 56px tap target and surfaces a one-line hint per stage so
// the choice doesn't require reading icon colors.
//
// Layout responsibility: the sheet is full-width on mobile (slides up
// from bottom, mimics native iOS action sheets) and centers on desktop.
// The host owns open/close + saveStage; the sheet just renders options
// and reports the picked one back via onPick.

import { useEffect, useRef } from 'react'
import { Check, Lock, X } from 'lucide-react'
import type { StageOption } from '@/components/dashboard/InlineEditCells'

// Optional per-stage hint text shown beneath the label inside each
// option row. Kept here (vs in STAGE_META) because the copy is voicy
// for the picker UI — STAGE_META is reused across kanban headers,
// summary strips, the chip itself, etc, where this longer text would
// be too much noise.
const STAGE_HINT: Record<string, string> = {
  new: 'Just came in. Not contacted yet.',
  in_person_estimate_scheduled: 'Site visit on the calendar.',
  quoted: 'Estimate sent, customer reviewing.',
  edits_needed: 'Customer asked for revisions.',
  awaiting_response: "It's been too long — time to chase.",
  accepted_not_scheduled: 'Deposit paid, install not booked yet.',
  scheduled: 'Install date locked in.',
}

type Props<S extends string> = {
  open: boolean
  onClose: () => void
  // Currently-selected stage. Highlighted with a checkmark in the list.
  currentStage: S
  options: StageOption<S>[]
  // Called when the user taps a non-disabled, non-current option.
  // The parent component owns the optimistic update + PATCH + rollback;
  // we just signal the user's intent.
  onPick: (stage: S) => void | Promise<void>
  // Optional short title — defaults to "Change stage".
  title?: string
  // When provided, a red "Cancel this lead" button is pinned to the bottom of
  // the sheet so Cancel is always reachable from the same place you change
  // status. The host owns the soft-cancel + optimistic removal.
  onCancel?: () => void
}

export default function StagePickerSheet<S extends string>(props: Props<S>) {
  if (!props.open) return null
  return <SheetBody {...props} />
}

function SheetBody<S extends string>({
  onClose,
  currentStage,
  options,
  onPick,
  title = 'Change stage',
  onCancel,
}: Props<S>) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Esc to close. Focus trap kept minimal — these are all buttons, the
  // browser handles tab order well enough without us hijacking it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    // Focus the first non-disabled, non-current option so keyboard users
    // can hit Enter immediately on the "best" pick.
    const first = dialogRef.current?.querySelector<HTMLElement>(
      'button[data-pickable="true"]',
    )
    first?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="py-1">
          {options.map((opt) => {
            const Icon = opt.icon
            const isCurrent = opt.stage === currentStage
            const pickable = !opt.disabled && !isCurrent
            return (
              <button
                key={opt.stage}
                type="button"
                disabled={!pickable}
                data-pickable={pickable ? 'true' : 'false'}
                onClick={async () => {
                  if (!pickable) return
                  // Always close, even if the save rejects — onPick (saveStage)
                  // surfaces its own error toast, so a failure shouldn't leave
                  // the sheet hanging open.
                  try { await onPick(opt.stage) } finally { onClose() }
                }}
                title={opt.disabled ? opt.disabledReason : undefined}
                aria-current={isCurrent ? 'true' : undefined}
                className={`w-full text-left px-5 py-3 flex items-start gap-3 border-b border-gray-100 last:border-b-0 transition-colors ${
                  isCurrent
                    ? 'bg-emerald-50/50 cursor-default'
                    : opt.disabled
                      ? 'bg-gray-50/50 opacity-50 cursor-not-allowed'
                      : 'hover:bg-primary-50/50 active:bg-primary-100 cursor-pointer'
                }`}
              >
                {/* Stage color chip — same color scheme as elsewhere so
                    Vince can match this row to the kanban column at a glance. */}
                <span
                  className={`inline-flex items-center justify-center w-9 h-9 rounded-full shrink-0 ${opt.color}`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{opt.label}</span>
                    {isCurrent && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">
                        <Check className="w-3 h-3" />
                        Current
                      </span>
                    )}
                    {opt.disabled && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500">
                        <Lock className="w-3 h-3" />
                        Locked
                      </span>
                    )}
                  </div>
                  {STAGE_HINT[opt.stage] && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {STAGE_HINT[opt.stage]}
                    </p>
                  )}
                  {opt.disabled && opt.disabledReason && (
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {opt.disabledReason}
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Always-available Cancel — soft-cancels the deal (job → cancelled,
            lead → archived) and drops it out of the pipeline. */}
        {onCancel && (
          <div className="border-t border-gray-200 p-3">
            <button
              type="button"
              onClick={() => { onCancel(); onClose() }}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 active:bg-red-200 border border-red-200 rounded-lg"
            >
              <X className="w-4 h-4" />
              Cancel this lead
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
