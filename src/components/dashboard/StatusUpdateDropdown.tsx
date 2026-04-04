'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Loader2 } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { JobStatus } from '@/lib/supabase/types'

const ownerTransitions: Partial<Record<JobStatus, { label: string; next: JobStatus }[]>> = {
  lead: [
    { label: 'Mark as Quoted', next: 'quoted' },
    { label: 'Cancel', next: 'cancelled' },
  ],
  quoted: [
    { label: 'Schedule Job', next: 'scheduled' },
    { label: 'Cancel', next: 'cancelled' },
  ],
  scheduled: [
    { label: 'Start Work', next: 'in_progress' },
    { label: 'Cancel', next: 'cancelled' },
  ],
  in_progress: [
    { label: 'Waiting for Materials', next: 'waiting_for_materials' },
    { label: 'Mark Complete', next: 'completed' },
  ],
  waiting_for_materials: [
    { label: 'Resume Work', next: 'in_progress' },
    { label: 'Mark Complete', next: 'completed' },
  ],
  completed: [
    { label: 'Mark as Paid', next: 'paid' },
  ],
}

const crewTransitions: Partial<Record<JobStatus, { label: string; next: JobStatus }[]>> = {
  scheduled: [{ label: 'Start Work', next: 'in_progress' }],
  in_progress: [
    { label: 'Waiting for Materials', next: 'waiting_for_materials' },
    { label: 'Mark Complete', next: 'completed' },
  ],
  waiting_for_materials: [
    { label: 'Resume Work', next: 'in_progress' },
    { label: 'Mark Complete', next: 'completed' },
  ],
}

interface StatusUpdateDropdownProps {
  jobId: string
  currentStatus: JobStatus
  isOwner?: boolean
}

export default function StatusUpdateDropdown({ jobId, currentStatus, isOwner = false }: StatusUpdateDropdownProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const transitions = isOwner ? ownerTransitions[currentStatus] : crewTransitions[currentStatus]

  if (!transitions || transitions.length === 0) return null

  async function handleUpdate(next: JobStatus) {
    setOpen(false)
    setSaving(true)

    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update status')
      }

      toast(`Status updated to ${next.replace('_', ' ')}`, 'success')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={saving}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {saving ? 'Updating...' : 'Update Status'}
        {!saving && <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[160px]">
            {transitions.map((t) => (
              <button
                key={t.next}
                onClick={() => handleUpdate(t.next)}
                className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                  t.next === 'cancelled' ? 'text-red-600' : 'text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
