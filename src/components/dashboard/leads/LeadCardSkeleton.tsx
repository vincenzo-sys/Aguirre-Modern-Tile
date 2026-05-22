// Pulse-animated placeholder card. Shape matches LeadCard so the
// layout doesn't reflow when real data lands. No deps — Tailwind's
// built-in `animate-pulse` does the shimmer.

export default function LeadCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden animate-pulse"
      aria-hidden
    >
      {/* Top row: stage chip + ⋯ menu */}
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="h-6 w-24 bg-gray-200 rounded-full" />
        <div className="h-7 w-7 bg-gray-100 rounded" />
      </div>

      {/* Identity */}
      <div className="px-4 mt-3 space-y-2">
        <div className="h-4 w-2/3 bg-gray-200 rounded" />
        <div className="h-3 w-1/2 bg-gray-100 rounded" />
      </div>

      {/* Meta line (only in full mode) */}
      {!compact && (
        <div className="px-4 mt-3 flex gap-2">
          <div className="h-3 w-20 bg-gray-100 rounded" />
          <div className="h-3 w-24 bg-gray-100 rounded" />
        </div>
      )}

      {/* Action row */}
      <div className="px-4 py-3 mt-3 border-t border-gray-100 flex items-stretch gap-2">
        <div className="flex-1 h-11 bg-gray-200 rounded-lg" />
        <div className="w-12 h-11 bg-gray-100 rounded-lg" />
        <div className="w-12 h-11 bg-gray-100 rounded-lg" />
      </div>
    </div>
  )
}

// Block of N skeleton cards under a fake bucket header, used during
// the initial /api/pipeline fetch on /dashboard/leads.
export function LeadsPageSkeleton() {
  return (
    <div className="max-w-2xl mx-auto" aria-busy="true" aria-live="polite">
      {/* Fake header */}
      <div className="flex items-start justify-between mb-4 gap-3 animate-pulse">
        <div>
          <div className="h-7 w-24 bg-gray-200 rounded" />
          <div className="h-3 w-48 bg-gray-100 rounded mt-2" />
        </div>
        <div className="h-9 w-28 bg-gray-200 rounded-lg" />
      </div>

      {/* Fake summary strip */}
      <div className="border border-gray-200 rounded-xl mb-4 flex animate-pulse">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex-1 px-3 py-2.5 border-r border-gray-100 last:border-r-0 space-y-2">
            <div className="h-3 w-12 bg-gray-200 rounded" />
            <div className="h-4 w-8 bg-gray-200 rounded" />
          </div>
        ))}
      </div>

      {/* Fake bucket: Action needed */}
      <section className="mb-6">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 animate-pulse">
          <div className="w-8 h-8 rounded-lg bg-gray-200" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 bg-gray-200 rounded" />
            <div className="h-2 w-48 bg-gray-100 rounded" />
          </div>
          <div className="h-6 w-8 bg-gray-100 rounded-full" />
        </div>
        <div className="space-y-3 mt-3">
          <LeadCardSkeleton />
          <LeadCardSkeleton />
        </div>
      </section>

      {/* Fake bucket: Working leads */}
      <section className="mb-6">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 animate-pulse">
          <div className="w-8 h-8 rounded-lg bg-gray-200" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 bg-gray-200 rounded" />
            <div className="h-2 w-48 bg-gray-100 rounded" />
          </div>
          <div className="h-6 w-8 bg-gray-100 rounded-full" />
        </div>
        <div className="space-y-3 mt-3">
          <LeadCardSkeleton />
        </div>
      </section>
    </div>
  )
}
