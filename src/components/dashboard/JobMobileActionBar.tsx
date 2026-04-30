'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MoreHorizontal, Check, X } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { JobStatus } from '@/lib/supabase/types'
import { getPrimaryTransition, getSecondaryTransitions } from '@/lib/jobStatusTransitions'

// Mobile-only sticky action bar at the bottom of the job detail page.
// Sits above the MobileTabBar. Surfaces the canonical "primary next
// status" (from jobStatusTransitions) as a thumb-zone button; the "..."
// button opens a sheet with the rest of the transitions.

interface Props {
  jobId: string
  currentStatus: JobStatus
  isOwner: boolean
}

export default function JobMobileActionBar({ jobId, currentStatus, isOwner }: Props) {
  const router = useRouter()
  const [updating, setUpdating] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const role = isOwner ? 'owner' : 'crew'
  const primary = getPrimaryTransition(role, currentStatus)
  const secondary = getSecondaryTransitions(role, currentStatus)

  // No transitions for terminal statuses (paid, cancelled). Don't render
  // the bar at all so it doesn't clutter the closed-out job view.
  if (!primary && secondary.length === 0) return null

  async function update(next: JobStatus) {
    setUpdating(true)
    setSheetOpen(false)
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to update')
      }
      toast(`Status: ${next.replace(/_/g, ' ')}`, 'success')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <>
      {/* Bottom sheet for secondary actions */}
      {sheetOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-50 bg-black/40"
            onClick={() => setSheetOpen(false)}
          />
          <div className="lg:hidden fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Other actions</h3>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Close"
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="py-2">
              {secondary.map((t) => (
                <button
                  key={t.next}
                  onClick={() => update(t.next)}
                  disabled={updating}
                  className={`w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 ${
                    t.tone === 'danger' ? 'text-red-600' : 'text-gray-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Sticky action bar — sits above the MobileTabBar.
          64px matches the tab bar's min-h, plus iPhone safe-area. */}
      <div
        className="lg:hidden fixed inset-x-0 z-30 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]"
        style={{ bottom: 'calc(64px + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-stretch gap-2 px-3 py-2.5">
          {primary && (
            <button
              type="button"
              onClick={() => update(primary.next)}
              disabled={updating}
              className="flex-1 flex items-center justify-center gap-2 bg-primary-600 text-white rounded-lg py-3 font-semibold text-sm active:scale-95 transition disabled:opacity-60 min-h-[44px]"
            >
              {updating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>{primary.label}</span>
            </button>
          )}
          {secondary.length > 0 && (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              disabled={updating}
              aria-label="More actions"
              className="px-4 bg-white text-gray-700 border-2 border-gray-200 rounded-lg active:scale-95 transition min-h-[44px]"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </>
  )
}
