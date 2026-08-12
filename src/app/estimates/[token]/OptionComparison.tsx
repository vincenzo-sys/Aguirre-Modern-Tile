import { Check } from 'lucide-react'
import { formatCurrency } from './PricingBreakdown'
import type { JobLineItem } from '@/lib/supabase/types'

// At-a-glance summary of the options, sitting above the full itemized blocks.
//
// This is a signpost, not the decision surface — every option is written out in
// full below, so this only has to answer "how many choices are there and what
// do they cost?" before the customer starts reading. Deliberately compact: on a
// phone, a tall comparison table would push the actual quotes below two screens
// of scrolling.

export type PublicOption = {
  key: string
  label: string
  blurb: string | null
  is_primary: boolean
  selected: boolean
  line_items: JobLineItem[]
  estimated_cost: number | string | null
  estimated_days: number | null
  deposit_amount: number
  // Carried so the page can render the FULL breakdown for each option, not
  // just a summary. Never includes margin_percent.
  scope_notes: string | null
  customer_provides: string | null
  warranty_text: string | null
  payment_terms_text: string | null
  payment_methods: string[] | null
}

export default function OptionComparison({
  options,
  accepted,
}: {
  options: PublicOption[]
  accepted: boolean
}) {
  if (options.length < 2) return null

  const costs = options.map((o) => Number(o.estimated_cost ?? 0))
  const cheapest = Math.min(...costs)

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-base font-semibold text-gray-900">
          {accepted ? 'Your options' : `${options.length} ways to do this project`}
        </h3>
        <p className="text-sm text-gray-600 mt-0.5">
          {accepted
            ? 'Both quotes are shown in full below for your records.'
            : 'Each one is written out in full below — same job, different finish. Pick whichever suits you.'}
        </p>
      </div>

      <ul className="divide-y divide-gray-100">
        {options.map((option, i) => {
          const letter = String.fromCharCode(65 + i)
          const cost = Number(option.estimated_cost ?? 0)
          const diff = cost - cheapest
          return (
            <li key={option.key} className="px-6 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  <span className="text-gray-400 font-bold mr-1.5">{letter}</span>
                  {option.label}
                  {option.selected && (
                    <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded align-middle">
                      <Check className="w-3 h-3" />
                      CHOSEN
                    </span>
                  )}
                </p>
                {option.blurb && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{option.blurb}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-base font-bold text-gray-900">{formatCurrency(cost)}</div>
                {/* Framing the gap rather than just two absolute numbers — the
                    decision is about the difference, not the totals. */}
                {diff > 0 && (
                  <div className="text-[11px] text-gray-500">
                    +{formatCurrency(diff)} vs Option A
                  </div>
                )}
                {option.estimated_days != null && (
                  <div className="text-[11px] text-gray-400">{option.estimated_days}d on site</div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
