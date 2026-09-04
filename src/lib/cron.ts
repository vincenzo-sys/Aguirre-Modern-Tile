import type Stripe from 'stripe'

// Shared plumbing for the scheduled routes under /api/cron.
//
// These two helpers were pasted verbatim into three-to-four crons each. That
// matters less for the lines saved than for what happens when one copy is
// tuned: a cron whose envInt silently reads a malformed cap as 0, or whose
// pager stops at page 1, fails by doing NOTHING — which is indistinguishable
// from "nothing was due today" in every log and Discord digest we have.
//
// Cron authorization lives in lib/apiAuth.ts (requireCronSecret), next to the
// other auth gates rather than here.

/**
 * A non-negative integer from the environment, or the fallback.
 *
 * Every cron exposes its caps and windows as env vars so a run can be retuned
 * without a deploy. A malformed or negative value falls back rather than
 * becoming 0, because 0 is a legitimate "send nothing" value and must only ever
 * be set on purpose.
 */
export function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/**
 * A boolean from the environment, or the fallback.
 *
 * Only the explicit strings below flip the value — anything else (a typo, an
 * empty string Vercel helpfully keeps after you clear a field) falls back. The
 * callers use this for safety rails that default ON, so "unparseable" must
 * never quietly mean "off".
 */
export function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  if (raw === 'true' || raw === '1' || raw === 'yes') return true
  if (raw === 'false' || raw === '0' || raw === 'no') return false
  return fallback
}

// ── Selecting columns that may not exist yet ──────────────────────────────

/** PostgREST's undefined_column (42703), however it surfaces. */
export function isMissingColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  return err.code === '42703' || /column .* does not exist|could not find/i.test(err.message ?? '')
}

export type QueryError = { code?: string; message?: string } | null

export type OptionalColumnGroup = {
  /** Reported back so the caller can say WHICH migration is missing. */
  name: string
  columns: string
}

/**
 * Select `base` plus as many of the `optional` column groups as the live
 * database actually has, and report which ones it didn't.
 *
 * This is not defensive paranoia. Migrations in this project are applied by
 * hand in the Supabase SQL editor, and as of 2026-08-28 migrations 040, 053,
 * 054, 056 and 057 are all written, committed and NOT applied. A cron that
 * hard-errors on a column its migration added is a cron that goes silently
 * dark, and the review-request cron already spent months dark once.
 *
 * The retry walks every subset of the optional groups, most complete first, so
 * it finds the largest set the database supports without having to parse which
 * column PostgREST named in the error. Capped at 4 groups (16 attempts) and
 * only ever reached on an unmigrated database — the happy path is one query.
 */
export async function selectWithOptionalColumns<Row>(
  run: (columns: string) => PromiseLike<{ data: unknown; error: QueryError }>,
  base: string,
  optional: OptionalColumnGroup[]
): Promise<{ rows: Row[]; error: QueryError; missing: string[] }> {
  if (optional.length > 4) {
    throw new Error('selectWithOptionalColumns: at most 4 optional groups')
  }

  const subsets = Array.from({ length: 1 << optional.length }, (_, mask) => mask)
    // Most complete first: more groups included wins, ties broken by keeping
    // the earlier-declared groups.
    .sort((a, b) => popcount(b) - popcount(a) || a - b)

  let lastError: QueryError = null
  for (const mask of subsets) {
    const included = optional.filter((_, i) => mask & (1 << i))
    const columns = [base, ...included.map((g) => g.columns)].join(', ')
    const { data, error } = await run(columns)
    if (!error) {
      const missing = optional.filter((_, i) => !(mask & (1 << i))).map((g) => g.name)
      return { rows: (data ?? []) as Row[], error: null, missing }
    }
    lastError = error
    // A real failure (permissions, network, a bad filter) must surface as
    // itself rather than being retried into a misleading "column missing".
    if (!isMissingColumn(error)) break
  }

  return { rows: [], error: lastError, missing: optional.map((g) => g.name) }
}

function popcount(n: number): number {
  let c = 0
  for (let x = n; x; x >>= 1) c += x & 1
  return c
}

/**
 * Drains a Stripe cursor-paginated list.
 *
 * Stripe caps list responses at 100. The account is small (49 balance
 * transactions all-time as of 2026-08-22), but silent truncation here reads
 * exactly like "those payments never happened" — the precise failure the
 * reconcile cron exists to prevent. `cap` bounds the walk so a has_more that
 * never clears cannot spin a scheduled function until it times out.
 */
export async function listAllStripe<T extends { id: string }>(
  page: (startingAfter?: string) => Promise<Stripe.ApiList<T>>,
  cap = 20
): Promise<T[]> {
  const out: T[] = []
  let cursor: string | undefined
  for (let i = 0; i < cap; i++) {
    const res = await page(cursor)
    out.push(...res.data)
    if (!res.has_more || res.data.length === 0) break
    cursor = res.data[res.data.length - 1].id
  }
  return out
}
