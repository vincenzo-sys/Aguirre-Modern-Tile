// Lightweight loading skeletons, shaped to match the card/table content they
// stand in for. Replaces plain "Loading…" text so a slow connection in the
// field reads as "working" rather than "broken". Mirrors the animate-pulse +
// aria-busy approach already used by LeadCardSkeleton.

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 animate-pulse" aria-hidden="true">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/2 bg-gray-200 rounded" />
          <div className="h-3 w-1/3 bg-gray-100 rounded" />
        </div>
        <div className="h-6 w-16 bg-gray-100 rounded-full" />
      </div>
    </div>
  )
}

export function SkeletonCards({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

export function SkeletonRows({ count = 6, cols = 4 }: { count?: number; cols?: number }) {
  return (
    <div className="animate-pulse" aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, r) => (
        <div key={r} className="flex gap-4 py-3 border-b border-gray-100">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="h-4 bg-gray-200 rounded" style={{ width: `${100 / cols}%` }} />
          ))}
        </div>
      ))}
    </div>
  )
}
