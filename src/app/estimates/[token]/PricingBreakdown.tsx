import type { JobLineItem } from '@/lib/supabase/types'

// The customer-facing pricing breakdown, extracted so it can render ONCE per
// quote option. When Vince offers Option A and Option B, the customer sees both
// itemized in full rather than a summary card plus one breakdown — comparing
// two totals without seeing what's behind them is exactly the moment a customer
// stalls.
//
// Presentation logic lives here (not in the estimator) because it is purely
// about how a homeowner reads a quote. The dashboard still shows every raw line.

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

// Customer-facing line items collapse into 6 buckets so the estimate reads
// like a homeowner's mental model — they don't care about 2 bags of thinset
// vs 1 bag, they care about "what am I paying for materials."
export type CustomerGroup =
  | 'materials'
  | 'addons'
  | 'install_labor'
  | 'demo_labor'
  | 'trash'
  | 'transport'

export const GROUP_ORDER: CustomerGroup[] = [
  'materials',
  'addons',
  'install_labor',
  'demo_labor',
  'trash',
  'transport',
]

const GROUP_LABEL: Record<CustomerGroup, string> = {
  materials: 'Materials',
  addons: 'Add-ons',
  install_labor: 'Install labor',
  demo_labor: 'Demo labor',
  trash: 'Trash & debris removal',
  transport: 'Travel & delivery',
}

// Add-ons in the customer's mental model = optional upgrades they choose
// (niches, benches, heated floors, decorative accents). The shower tray,
// drain, and curb are required components of a walk-in shower — they're
// materials. Match against keywords specific to upgrade-style items so
// only those land in add-ons; everything else material-category goes to
// Materials.
const ADDON_KEYWORDS = ['bench', 'niche', 'corner shelf', 'cornershelf', 'ditra-heat', 'heated floor']

export function classifyLineItem(item: JobLineItem): CustomerGroup {
  if (item.category === 'materials') {
    const lower = item.description.toLowerCase()
    if (ADDON_KEYWORDS.some((k) => lower.includes(k))) return 'addons'
    return 'materials'
  }
  const desc = item.description.toLowerCase()
  if (desc.startsWith('demolition') || desc.startsWith('demo')) return 'demo_labor'
  // Trash labels have varied across engine versions: "Jobsite cleanup ...",
  // "Trash and debris removal", "Trash & debris ...". The "debris" substring
  // catches all of them.
  if (desc.startsWith('trash') || desc.startsWith('jobsite cleanup') || desc.includes('debris')) {
    return 'trash'
  }
  // Transport labels likewise: "Travel: 8 trips...", "Delivery & materials
  // transport", "Transportation (Revere base...)". Match all three prefixes.
  if (desc.startsWith('travel') || desc.startsWith('delivery') || desc.startsWith('transport')) {
    return 'transport'
  }
  return 'install_labor'
}

// Flat rendering for hand-built bundled estimates (Erwin's PDF format —
// every line is "Area Description: $Amount" with no inner category split).
// We detect this when every line item is unit='ea' and category='labor' —
// the template estimator never produces that shape (it always emits day-
// unit labor + sheet/bag/tube materials), so the heuristic uniquely
// identifies bundled hand-built quotes.
export function isFlatEstimate(items: JobLineItem[]): boolean {
  if (items.length === 0) return false
  return items.every((i) => i.unit === 'ea' && i.category === 'labor')
}

// Must match PROJECTWIDE_LABEL in generate_dashboard_estimate.py.
export const PROJECTWIDE_LABEL = 'Project-wide'

/**
 * Group items by section in first-appearance order, then float the implicit
 * "Project-wide" bucket (unsectioned items, trash, transport) to the end so
 * per-room costs come first.
 */
export function orderSections(items: JobLineItem[]): Array<readonly [string, JobLineItem[]]> {
  const sectionMap = new Map<string, JobLineItem[]>()
  for (const item of items) {
    const key = item.section || PROJECTWIDE_LABEL
    if (!sectionMap.has(key)) sectionMap.set(key, [])
    sectionMap.get(key)!.push(item)
  }
  return [
    ...Array.from(sectionMap.entries()).filter(([k]) => k !== PROJECTWIDE_LABEL),
    ...(sectionMap.has(PROJECTWIDE_LABEL)
      ? [[PROJECTWIDE_LABEL, sectionMap.get(PROJECTWIDE_LABEL)!] as const]
      : []),
  ] as Array<readonly [string, JobLineItem[]]>
}

function CustomerGroupRow({
  group,
  items,
  total,
}: {
  group: CustomerGroup
  items: JobLineItem[]
  total: number
}) {
  if (items.length === 0) return null
  // Materials + add-ons render as a single category row with bullets of the
  // included items underneath. Labor / trash / transport don't list items
  // (one labor line means one description anyway).
  const showBullets = group === 'materials' || group === 'addons'
  return (
    <div className="px-6 py-3 border-b border-gray-100 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-gray-900">{GROUP_LABEL[group]}</span>
        <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
          {formatCurrency(total)}
        </span>
      </div>
      {showBullets && (
        <ul className="mt-1.5 ml-1 space-y-0.5 text-[11px] text-gray-400">
          {items.map((item, i) => (
            <li key={i} className="leading-tight">
              <span className="text-gray-300">•</span>{' '}
              {item.quantity > 1 ? `${item.quantity} × ` : ''}
              {item.description}
              {/* No source/retail "(view)" link on the customer-facing estimate —
                  it exposes our sourcing. The internal dashboard line-item editor
                  keeps source_url for the team. */}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The itemized body of a quote — flat table for hand-built bundled estimates,
 * section + category rollup for generated ones. Renders the rows only; the
 * caller supplies the surrounding card so it can be reused inside an option
 * block or as the page's single breakdown.
 */
export default function PricingBreakdown({ lineItems }: { lineItems: JobLineItem[] }) {
  if (lineItems.length === 0) return null

  if (isFlatEstimate(lineItems)) {
    return (
      <div className="divide-y divide-gray-100">
        {lineItems.map((item, idx) => (
          <div key={idx} className="px-6 py-3 flex items-start justify-between gap-4">
            <p className="text-sm text-gray-900 flex-1">{item.description}</p>
            <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
              {formatCurrency(item.amount)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  const sections = orderSections(lineItems)
  const showSectionHeaders = sections.length > 1 || sections[0]?.[0] !== PROJECTWIDE_LABEL

  return (
    <>
      {sections.map(([sectionKey, sectionItems], sIdx) => {
        const groups: Record<CustomerGroup, { items: JobLineItem[]; total: number }> = {
          materials: { items: [], total: 0 },
          addons: { items: [], total: 0 },
          install_labor: { items: [], total: 0 },
          demo_labor: { items: [], total: 0 },
          trash: { items: [], total: 0 },
          transport: { items: [], total: 0 },
        }
        for (const item of sectionItems) {
          const g = classifyLineItem(item)
          groups[g].items.push(item)
          groups[g].total += item.amount ?? 0
        }
        const subtotal = sectionItems.reduce((s, i) => s + (i.amount ?? 0), 0)
        return (
          <div key={sectionKey}>
            {showSectionHeaders && (
              <div
                className={`px-6 py-3 bg-primary-50 border-b border-primary-100 flex items-center justify-between ${
                  sIdx > 0 ? 'border-t-4 border-t-gray-100' : ''
                }`}
              >
                <span className="text-sm font-semibold text-primary-900 uppercase tracking-wider">
                  {sectionKey}
                </span>
                <span className="text-sm font-semibold text-primary-900">
                  {formatCurrency(subtotal)}
                </span>
              </div>
            )}
            {GROUP_ORDER.map((g) => (
              <CustomerGroupRow
                key={g}
                group={g}
                items={groups[g].items}
                total={groups[g].total}
              />
            ))}
          </div>
        )
      })}
    </>
  )
}
