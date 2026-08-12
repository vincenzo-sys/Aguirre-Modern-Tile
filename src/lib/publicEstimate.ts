import type { JobLineItem } from '@/lib/supabase/types'

// Sanitizers for anything served on the customer-facing estimate link.
//
// /api/public/estimates/[token] has NO auth — possession of the token is the
// whole gate — so every field added there is world-readable to anyone the link
// reaches (forwarded emails, screenshots, a spouse's phone). These functions
// exist so "what leaves the server" is one small, tested surface rather than a
// judgement call spread across a route handler.
//
// Two things must never escape:
//   - margin_percent   — what Aguirre makes on the job
//   - source_url / source_name — where materials were price-shopped and at what
//     cost. The estimate page has always declined to RENDER these; allow-listing
//     here means they don't reach the browser at all, where "view source" would
//     have found them regardless.

export const DEPOSIT_RATE = 0.1

export function depositFor(cost: number | string | null | undefined): number {
  const n = Number(cost ?? 0)
  return Number.isFinite(n) && n > 0 ? Math.round(n * DEPOSIT_RATE * 100) / 100 : 0
}

/**
 * Allow-list line item fields. Deliberately a rebuild rather than a delete of
 * known-bad keys: a future column added to line items is then private by
 * default instead of leaking until someone remembers to strip it.
 */
export function publicLineItems(items: unknown): JobLineItem[] {
  if (!Array.isArray(items)) return []
  return items.map((raw) => {
    const item = (raw ?? {}) as Partial<JobLineItem>
    return {
      category: item.category as JobLineItem['category'],
      description: item.description as string,
      quantity: Number(item.quantity ?? 0),
      unit: item.unit as JobLineItem['unit'],
      unit_price: Number(item.unit_price ?? 0),
      amount: Number(item.amount ?? 0),
      section: item.section ?? null,
    }
  })
}

/** A job_estimates row as the customer is allowed to see it. */
export interface PublicEstimateOption {
  key: string
  label: string
  blurb: string | null
  is_primary: boolean
  selected: boolean
  line_items: JobLineItem[]
  scope_notes: string | null
  customer_provides: string | null
  warranty_text: string | null
  payment_terms_text: string | null
  payment_methods: string[] | null
  estimated_cost: number | null
  estimated_days: number | null
  deposit_amount: number
}

export function toPublicOption(row: Record<string, unknown>): PublicEstimateOption {
  const cost = row.estimated_cost == null ? null : Number(row.estimated_cost)
  return {
    key: String(row.option_key ?? ''),
    label: String(row.label ?? 'Standard'),
    blurb: (row.blurb as string | null) ?? null,
    is_primary: !!row.is_primary,
    // Exposed as a boolean, not the timestamp — the customer needs to know
    // "you picked this", not precisely when they clicked.
    selected: !!row.selected_at,
    line_items: publicLineItems(row.line_items),
    scope_notes: (row.scope_notes as string | null) ?? null,
    customer_provides: (row.customer_provides as string | null) ?? null,
    warranty_text: (row.warranty_text as string | null) ?? null,
    payment_terms_text: (row.payment_terms_text as string | null) ?? null,
    payment_methods: (row.payment_methods as string[] | null) ?? null,
    estimated_cost: cost,
    estimated_days: (row.estimated_days as number | null) ?? null,
    deposit_amount: depositFor(cost),
  }
}
