// Small formatters used across the leads page v2 (summary strip,
// bucket / column headers, days-in-stage chip). Kept zero-dep so they
// can be imported into any client component without pulling in a
// heavy locale lib.

// $1,234 if under $10k; $12.3k between $10k and $1m; $1.2m above.
// Negative numbers are not expected (estimates aren't refunds) — render
// as 0 if somehow negative.
export function formatMoneyShort(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '$0'
  if (n < 10_000) return `$${Math.round(n).toLocaleString('en-US')}`
  if (n < 1_000_000) return `$${(n / 1000).toFixed(n < 100_000 ? 1 : 0)}k`
  return `$${(n / 1_000_000).toFixed(1)}m`
}

// Whole days between `iso` and now. Negative results clamp to 0 (a
// future timestamp shouldn't yield "—3 days ago"). Returns null when
// the input isn't parseable so callers can decide how to render.
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  const days = Math.floor((Date.now() - t) / 86_400_000)
  return Math.max(0, days)
}
