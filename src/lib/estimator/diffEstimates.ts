import type { JobLineItem } from '@/lib/supabase/types'

// Diffing two estimate versions — "what changed since we last talked?"
//
// This is the read side of migration 048. job_estimates keeps an append-only
// copy of every revision; this turns any two of them into a human answer.
//
// IDENTITY: line items have no id, so a line has to be recognised by its
// content. The key is `${section}::${description}` — deliberately the SAME key
// /api/estimates/generate already uses (route.ts:228) to carry material
// order-status across a re-price. That convention is proven in production, and
// reusing it means a line the generator considers "the same line" is the same
// line here too.
//
// Duplicates: an estimate can legitimately contain two rows with identical
// section + description (two different 12x24 orders, say). A plain Map would
// collapse them and report a phantom add/remove. Occurrences are therefore
// numbered, so the 2nd "Thinset" before matches the 2nd "Thinset" after.

/** Anything carrying an estimate payload — a job row or a job_estimates row. */
export interface EstimateSnapshot {
  line_items?: JobLineItem[] | null
  estimated_cost?: number | string | null
  estimated_days?: number | null
}

export interface ChangedLineItem {
  before: JobLineItem
  after: JobLineItem
  amountDelta: number
  quantityDelta: number
  unitPriceDelta: number
}

export interface EstimateDiff {
  added: JobLineItem[]
  removed: JobLineItem[]
  changed: ChangedLineItem[]
  /** Lines present in both and identical — the bulk of a typical revision. */
  unchangedCount: number
  totalBefore: number
  totalAfter: number
  totalDelta: number
  daysBefore: number | null
  daysAfter: number | null
  daysDelta: number
  /** True when nothing at all moved — lets the UI say "no changes" honestly. */
  isEmpty: boolean
  /** Sections touched by this diff, in first-seen order (before, then after). */
  sections: string[]
}

const money = (n: number) => Math.round(n * 100) / 100
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** Section label used for grouping; null/empty collapses to '' (project-wide). */
export function sectionOf(item: JobLineItem): string {
  return typeof item.section === 'string' ? item.section : ''
}

/**
 * Stable identity for a line item within one estimate. `occurrence`
 * disambiguates repeated section+description pairs.
 */
export function lineItemKey(item: JobLineItem, occurrence = 0): string {
  return `${sectionOf(item)}::${item.description}#${occurrence}`
}

/** Index a list by key, numbering repeats so duplicates pair up positionally. */
function indexByKey(items: JobLineItem[]): Map<string, JobLineItem> {
  const seen = new Map<string, number>()
  const out = new Map<string, JobLineItem>()
  for (const item of items) {
    const base = `${sectionOf(item)}::${item.description}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    out.set(lineItemKey(item, n), item)
  }
  return out
}

/**
 * A line counts as changed when the money or the measurement moved. Cosmetic
 * fields are ignored on purpose: `status` is purchasing progress (the crew
 * marking a material as ordered is not a quote revision), and source_url /
 * source_name are internal price-shopping breadcrumbs the customer never sees.
 */
function hasChanged(a: JobLineItem, b: JobLineItem): boolean {
  return (
    num(a.amount) !== num(b.amount) ||
    num(a.quantity) !== num(b.quantity) ||
    num(a.unit_price) !== num(b.unit_price) ||
    a.unit !== b.unit ||
    a.category !== b.category
  )
}

/** Total for a snapshot: the stored total when present, else the line sum. */
function totalOf(snap: EstimateSnapshot): number {
  const stored = snap.estimated_cost
  if (stored !== null && stored !== undefined && stored !== '') {
    const n = Number(stored)
    if (Number.isFinite(n)) return money(n)
  }
  return money((snap.line_items ?? []).reduce((s, li) => s + num(li.amount), 0))
}

/**
 * Compare two estimate versions.
 *
 * `before` and `after` are ordered oldest → newest, so a positive `totalDelta`
 * means the price went UP.
 */
export function diffEstimates(before: EstimateSnapshot, after: EstimateSnapshot): EstimateDiff {
  const beforeItems = before.line_items ?? []
  const afterItems = after.line_items ?? []

  const beforeIdx = indexByKey(beforeItems)
  const afterIdx = indexByKey(afterItems)

  const added: JobLineItem[] = []
  const removed: JobLineItem[] = []
  const changed: ChangedLineItem[] = []
  let unchangedCount = 0

  // Walk `after` in its own order so the UI reads like the current estimate.
  for (const [key, item] of afterIdx) {
    const prev = beforeIdx.get(key)
    if (!prev) {
      added.push(item)
    } else if (hasChanged(prev, item)) {
      changed.push({
        before: prev,
        after: item,
        amountDelta: money(num(item.amount) - num(prev.amount)),
        quantityDelta: money(num(item.quantity) - num(prev.quantity)),
        unitPriceDelta: money(num(item.unit_price) - num(prev.unit_price)),
      })
    } else {
      unchangedCount++
    }
  }

  for (const [key, item] of beforeIdx) {
    if (!afterIdx.has(key)) removed.push(item)
  }

  const sections: string[] = []
  for (const item of [...beforeItems, ...afterItems]) {
    const s = sectionOf(item)
    if (!sections.includes(s)) sections.push(s)
  }

  const totalBefore = totalOf(before)
  const totalAfter = totalOf(after)
  const daysBefore = before.estimated_days ?? null
  const daysAfter = after.estimated_days ?? null

  return {
    added,
    removed,
    changed,
    unchangedCount,
    totalBefore,
    totalAfter,
    totalDelta: money(totalAfter - totalBefore),
    daysBefore,
    daysAfter,
    daysDelta: (daysAfter ?? 0) - (daysBefore ?? 0),
    isEmpty:
      added.length === 0 &&
      removed.length === 0 &&
      changed.length === 0 &&
      totalAfter === totalBefore &&
      daysAfter === daysBefore,
    sections,
  }
}

/** Group a diff's entries by section for sectioned rendering. */
export interface SectionDiff {
  section: string
  added: JobLineItem[]
  removed: JobLineItem[]
  changed: ChangedLineItem[]
}

export function groupDiffBySection(diff: EstimateDiff): SectionDiff[] {
  const bySection = new Map<string, SectionDiff>()
  const bucket = (s: string) => {
    let b = bySection.get(s)
    if (!b) {
      b = { section: s, added: [], removed: [], changed: [] }
      bySection.set(s, b)
    }
    return b
  }

  for (const item of diff.added) bucket(sectionOf(item)).added.push(item)
  for (const item of diff.removed) bucket(sectionOf(item)).removed.push(item)
  for (const c of diff.changed) bucket(sectionOf(c.after)).changed.push(c)

  // Project-wide lines (no section) float last, matching how the customer
  // estimate page orders sections (estimates/[token]/page.tsx:237-256).
  return Array.from(bySection.values()).sort((a, b) => {
    if (a.section === b.section) return 0
    if (a.section === '') return 1
    if (b.section === '') return -1
    return diff.sections.indexOf(a.section) - diff.sections.indexOf(b.section)
  })
}
