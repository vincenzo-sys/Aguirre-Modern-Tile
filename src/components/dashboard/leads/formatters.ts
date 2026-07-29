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

// "just now" → "5m ago" → "3h ago" → "2d ago" → "Jul 12". Shared by the
// estimate thread and the Inbox so relative times read the same everywhere.
export function formatTimeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Human phone display for any stored format: 10 digits → (617) 555-1234,
// 11 with a leading 1 → same, anything else renders as-is.
export function formatPhoneDisplay(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  const d = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (d.length !== 10) return raw
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}
