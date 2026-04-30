'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MoreHorizontal, Check, X } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { JobStatus } from '@/lib/supabase/types'

// Mobile-only sticky action bar at the bottom of the job detail page.
// Sits above the MobileTabBar (`bottom-[76px]` clears tab bar + iPhone
// safe-area). Surfaces the most-likely-positive-next status as a big
// thumb-zone primary button; the "..." button opens a sheet with the
// full transition list (cancel, side branches, etc.).
//
// Why a separate component instead of extending StatusUpdateDropdown:
// the dropdown is desktop-friendly (small button, anchored menu). Phones
// need a full-width primary action that competes for attention with the
// MobileTabBar — small dropdowns get lost. Also, the "happy path" status
// progression is unambiguous enough that picking one default-next per
// status removes a tap entirely (no menu open, no scan, no pick).

type Transition = { label: string; next: JobStatus; tone?: 'primary' | 'danger' }

// Primary positive next-status per current status. Picked by which
// transition Vince/Christian actually wants 90% of the time, not just
// "first in alphabetical order."
const ownerPrimary: Partial<Record<JobStatus, Transition>> = {
  lead: { label: 'Mark Quoted', next: 'quoted' },
  quoted: { label: 'Schedule Job', next: 'scheduled' },
  estimate_revised: { label: 'Schedule Job', next: 'scheduled' },
  accepted_not_scheduled: { label: 'Schedule Job', next: 'scheduled' },
  scheduled: { label: 'Start Work', next: 'in_progress' },
  in_progress: { label: 'Mark Complete', next: 'completed' },
  waiting_for_materials: { label: 'Resume Work', next: 'in_progress' },
  completed: { label: 'Mark Paid', next: 'paid' },
}

const ownerSecondary: Partial<Record<JobStatus, Transition[]>> = {
  lead: [{ label: 'Cancel job', next: 'cancelled', tone: 'danger' }],
  quoted: [
    { label: 'Mark revised', next: 'estimate_revised' },
    { label: 'Deposit received', next: 'accepted_not_scheduled' },
    { label: 'Cancel job', next: 'cancelled', tone: 'danger' },
  ],
  estimate_revised: [
    { label: 'Deposit received', next: 'accepted_not_scheduled' },
    { label: 'Cancel job', next: 'cancelled', tone: 'danger' },
  ],
  accepted_not_scheduled: [
    { label: 'Cancel job', next: 'cancelled', tone: 'danger' },
  ],
  scheduled: [{ label: 'Cancel job', next: 'cancelled', tone: 'danger' }],
  in_progress: [
    { label: 'Waiting for materials', next: 'waiting_for_materials' },
  ],
  waiting_for_materials: [{ label: 'Mark complete', next: 'completed' }],
}

const crewPrimary: Partial<Record<JobStatus, Transition>> = {
  scheduled: { label: 'Start Work', next: 'in_progress' },
  in_progress: { label: 'Mark Complete', next: 'completed' },
  waiting_for_materials: { label: 'Resume Work', next: 'in_progress' },
}

const crewSecondary: Partial<Record<JobStatus, Transition[]>> = {
  in_progress: [{ label: 'Waiting for materials', next: 'waiting_for_materials' }],
  waiting_for_materials: [{ label: 'Mark complete', next: 'completed' }],
}

interface Props {
  jobId: string
  currentStatus: JobStatus
  isOwner: boolean
}

export default function JobMobileActionBar({ jobId, currentStatus, isOwner }: Props) {
  const router = useRouter()
  const [updating, setUpdating] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const primary = isOwner ? ownerPrimary[currentStatus] : crewPrimary[currentStatus]
  const secondary = (isOwner ? ownerSecondary[currentStatus] : crewSecondary[currentStatus]) || []

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
