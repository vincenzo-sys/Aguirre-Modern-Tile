'use client'

// "How many days?" — the multi-day control, shared by AddEventModal and
// ScheduleInstallModal.
//
// Before this, the two modals disagreed: the install modal showed a bare pair
// of date inputs, and the event modal hid its end date inside a collapsed
// <details> labelled "Add end date / time (optional)", so blocking out three
// days for a custom event was something you had to go looking for.
//
// The chips are a WRITE-THROUGH control on the end date — tapping "3" calls
// onChangeEnd(endFromSpan(start, 3)) and nothing else. There is no parallel
// "days" state to fall out of sync with the date, which is the usual way a
// control like this rots. The explicit date input stays authoritative for
// anything longer or odder than the chips offer.

import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { endFromSpan, formatSpan, spanDays } from '@/lib/scheduleDates'

const QUICK_DAYS = [1, 2, 3, 4, 5, 6]
const OVERFLOW_DAYS = 7

type Props = {
  startYmd: string
  /** Current end date. Blank/absent means a single day. */
  endYmd: string
  onChangeEnd: (ymd: string) => void
  /**
   * Pre-selected length, e.g. from the job's estimated_days. Only a hint for
   * the "from the estimate" note — the parent decides whether to apply it.
   */
  suggestedDays?: number | null
  label?: string
}

export default function DurationPicker({
  startYmd,
  endYmd,
  onChangeEnd,
  suggestedDays = null,
  label = 'How many days?',
}: Props) {
  const span = startYmd ? spanDays(startYmd, endYmd || startYmd) : 1
  const isOverflow = span >= OVERFLOW_DAYS
  const [showExact, setShowExact] = useState(isOverflow)

  // A span that grows past the chips (by drag, or by loading an existing
  // 9-day install) should reveal the date input rather than silently showing
  // "7+" with no way to see the actual date.
  useEffect(() => {
    if (isOverflow) setShowExact(true)
  }, [isOverflow])

  if (!startYmd) return null

  const effectiveEnd = endYmd || startYmd
  const suggested = suggestedDays && suggestedDays > 0 ? Math.ceil(suggestedDays) : null

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <label className="block text-xs font-medium text-gray-700">{label}</label>
        {suggested !== null && suggested === span && (
          <span className="text-[11px] text-primary-700">From the estimate</span>
        )}
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5">
        {QUICK_DAYS.map((n) => {
          const active = !isOverflow && span === n
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChangeEnd(endFromSpan(startYmd, n))}
              aria-pressed={active}
              className={`min-h-[44px] min-w-[44px] px-3 rounded-md text-sm font-medium shrink-0 border transition-colors ${
                active
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {n}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => {
            setShowExact(true)
            // Jump to a week so the control does something visible; the date
            // input below is right there to fine-tune it.
            if (!isOverflow) onChangeEnd(endFromSpan(startYmd, OVERFLOW_DAYS))
          }}
          aria-pressed={isOverflow}
          className={`min-h-[44px] px-3 rounded-md text-sm font-medium shrink-0 border transition-colors ${
            isOverflow
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          7+
        </button>
      </div>

      <p className="text-[11px] text-gray-600 mt-1">{formatSpan(startYmd, effectiveEnd)}</p>

      {!showExact ? (
        <button
          type="button"
          onClick={() => setShowExact(true)}
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:underline"
        >
          Set exact end date
          <ChevronDown className="w-3 h-3" />
        </button>
      ) : (
        <div className="mt-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">End date</label>
          <input
            type="date"
            value={effectiveEnd}
            min={startYmd}
            onChange={(e) => onChangeEnd(e.target.value || startYmd)}
            className="w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      )}
    </div>
  )
}
