import Link from 'next/link'
import { Check, Clock, ArrowRight } from 'lucide-react'
import AcceptAndPayButton from './AcceptAndPayButton'
import type { JobLineItem } from '@/lib/supabase/types'

// Side-by-side quote options on the customer's estimate link.
//
// The point of showing tiers is that it changes the question the customer is
// answering: not "yes or no?" but "which one?". So each card has to stand on
// its own — price, timeline, what's different — and carry its own Accept
// button, because making someone switch views before they can commit is where
// momentum dies.
//
// Selection is a plain ?option= link rather than client state: it survives a
// refresh, it can be sent in a text ("here's the upgraded one"), and the full
// breakdown below re-renders server-side for whichever option is open.

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
  // Carried so the page can render the FULL breakdown for whichever option is
  // open, not just the summary card. Never includes margin_percent.
  scope_notes: string | null
  customer_provides: string | null
  warranty_text: string | null
  payment_terms_text: string | null
  payment_methods: string[] | null
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(amount)
}

/**
 * What actually differs between this option and the others — the reason a
 * customer would pick it. Compares material descriptions, since that is where
 * a Good/Better/Best split almost always lives (the tile changes, the labor
 * mostly doesn't).
 */
function distinctMaterials(option: PublicOption, all: PublicOption[]): string[] {
  const others = new Set(
    all
      .filter((o) => o.key !== option.key)
      .flatMap((o) => o.line_items.filter((li) => li.category === 'materials').map((li) => li.description))
  )
  const mine = option.line_items
    .filter((li) => li.category === 'materials')
    .map((li) => li.description)

  const unique = Array.from(new Set(mine.filter((d) => !others.has(d))))
  // Nothing unique (options differ only by quantity/price) — fall back to the
  // biggest-ticket materials so the card still says something concrete.
  if (unique.length === 0) {
    return Array.from(
      new Set(
        [...option.line_items]
          .filter((li) => li.category === 'materials')
          .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
          .map((li) => li.description)
      )
    ).slice(0, 3)
  }
  return unique.slice(0, 4)
}

export default function OptionComparison({
  token,
  options,
  activeKey,
  accepted,
}: {
  token: string
  options: PublicOption[]
  activeKey: string
  accepted: boolean
}) {
  if (options.length < 2) return null

  return (
    <section className="mb-6">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
          Choose your option
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          {options.length} ways to do this project. Tap one to see its full breakdown below.
        </p>
      </div>

      {/* One column on phones (where most customers open this), side by side
          from sm up. Cards are equal-height so the prices line up. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {options.map((option) => {
          const isActive = option.key === activeKey
          const highlights = distinctMaterials(option, options)
          const cost = Number(option.estimated_cost ?? 0)

          return (
            <div
              key={option.key}
              className={`flex flex-col rounded-xl border-2 bg-white overflow-hidden transition-colors ${
                isActive ? 'border-primary-500 shadow-md' : 'border-gray-200'
              }`}
            >
              <div
                className={`px-4 py-3 border-b ${
                  isActive ? 'bg-primary-50 border-primary-200' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h4
                    className={`font-semibold ${isActive ? 'text-primary-900' : 'text-gray-900'}`}
                  >
                    {option.label}
                  </h4>
                  {option.selected && (
                    <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                      YOUR PICK
                    </span>
                  )}
                </div>
                {option.blurb && (
                  <p className="text-xs text-gray-600 mt-0.5">{option.blurb}</p>
                )}
              </div>

              <div className="px-4 py-4 flex-1 flex flex-col">
                <div className="text-2xl font-bold text-gray-900">
                  {formatCurrency(cost)}
                </div>
                {option.estimated_days != null && (
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    About {option.estimated_days} day{option.estimated_days === 1 ? '' : 's'} on site
                  </p>
                )}

                {highlights.length > 0 && (
                  <ul className="mt-3 space-y-1 flex-1">
                    {highlights.map((h) => (
                      <li key={h} className="flex items-start gap-1.5 text-xs text-gray-700">
                        <Check className="w-3 h-3 mt-0.5 text-green-600 shrink-0" />
                        <span className="break-words">{h}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-4 space-y-2 no-print">
                  {!accepted && (
                    <AcceptAndPayButton
                      token={token}
                      depositAmount={option.deposit_amount}
                      optionKey={option.key}
                      optionLabel={option.label}
                      compact
                    />
                  )}
                  {isActive ? (
                    <p className="text-[11px] text-primary-700 font-medium">
                      Full breakdown shown below ↓
                    </p>
                  ) : (
                    <Link
                      href={`/estimates/${token}?option=${option.key}`}
                      scroll={false}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-700"
                    >
                      See the details
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
