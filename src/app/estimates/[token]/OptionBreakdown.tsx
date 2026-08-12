import { Check, Clock } from 'lucide-react'
import AcceptAndPayButton from './AcceptAndPayButton'
import PricingBreakdown, { formatCurrency } from './PricingBreakdown'
import type { PublicOption } from './OptionComparison'

// One quote option, fully itemized — the whole point being that a customer
// comparing two prices can see what's behind each of them without switching
// views. Two options means two of these blocks stacked, each self-contained:
// its own breakdown, its own total, its own deposit, its own Accept button.
//
// Deliberately NOT a tabbed/toggle UI. Most customers open this on a phone and
// half of them forward it to a spouse; anything hidden behind an interaction
// is effectively invisible, and it doesn't survive being printed to PDF.

export default function OptionBreakdown({
  token,
  option,
  index,
  total,
  accepted,
  validThrough,
}: {
  token: string
  option: PublicOption
  /** 0-based; renders as Option A, Option B, … */
  index: number
  /** How many options there are, for the "1 of 2" affordance. */
  total: number
  accepted: boolean
  validThrough: string | null
}) {
  const letter = String.fromCharCode(65 + index)
  const cost = Number(option.estimated_cost ?? 0)

  return (
    <section
      className={`bg-white rounded-xl shadow-sm border-2 overflow-hidden mb-6 ${
        option.selected ? 'border-green-500' : 'border-gray-200'
      }`}
    >
      {/* Header — the option's identity travels with its numbers, so a printed
          or screenshotted page can't lose which price belongs to which. */}
      <div
        className={`px-6 py-4 border-b ${
          option.selected
            ? 'bg-green-50 border-green-200'
            : 'bg-gray-900 border-gray-900'
        }`}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p
              className={`text-[11px] font-bold uppercase tracking-widest ${
                option.selected ? 'text-green-700' : 'text-gray-400'
              }`}
            >
              Option {letter} of {total}
            </p>
            <h3
              className={`text-xl font-bold mt-0.5 ${
                option.selected ? 'text-green-900' : 'text-white'
              }`}
            >
              {option.label}
            </h3>
            {option.blurb && (
              <p
                className={`text-sm mt-1 ${
                  option.selected ? 'text-green-800' : 'text-gray-300'
                }`}
              >
                {option.blurb}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <div
              className={`text-2xl font-bold ${
                option.selected ? 'text-green-900' : 'text-white'
              }`}
            >
              {formatCurrency(cost)}
            </div>
            {option.estimated_days != null && (
              <p
                className={`text-xs mt-0.5 flex items-center justify-end gap-1 ${
                  option.selected ? 'text-green-700' : 'text-gray-400'
                }`}
              >
                <Clock className="w-3 h-3" />
                {option.estimated_days} day{option.estimated_days === 1 ? '' : 's'} on site
              </p>
            )}
          </div>
        </div>
        {option.selected && (
          <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-green-800">
            <Check className="w-3.5 h-3.5" />
            This is the option you chose
          </p>
        )}
      </div>

      <PricingBreakdown lineItems={option.line_items} />

      {/* Total + deposit for THIS option */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
        <div className="flex items-baseline justify-between">
          <span className="text-gray-600 text-sm">Option {letter} total</span>
          <span className="text-2xl font-bold text-gray-900">{formatCurrency(cost)}</span>
        </div>
        <div className="flex items-baseline justify-between pt-2 mt-2 border-t border-gray-200">
          <span className="text-sm text-gray-700">10% deposit to reserve your date</span>
          <span className="text-lg font-semibold text-primary-700">
            {formatCurrency(option.deposit_amount)}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          The remainder is due on completion of the project.
        </p>
        {validThrough && (
          <p className="text-xs text-gray-400 mt-1">Estimate valid through {validThrough}</p>
        )}

        {!accepted && (
          <div className="mt-4 no-print">
            <AcceptAndPayButton
              token={token}
              depositAmount={option.deposit_amount}
              optionKey={option.key}
              optionLabel={option.label}
            />
            <p className="text-[11px] text-gray-500 mt-2">
              Choosing this option locks in {formatCurrency(cost)} — the other option is
              simply not selected. Nothing is charged beyond the deposit.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
