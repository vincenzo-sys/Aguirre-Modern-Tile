'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { JobStatus } from '@/lib/supabase/types'

const allowedTransitions: Partial<Record<JobStatus, { label: string; next: JobStatus }[]>> = {
  scheduled: [{ label: 'Start Work', next: 'in_progress' }],
  in_progress: [{ label: 'Mark Complete', next: 'completed' }],
}

interface StatusUpdateDropdownProps {
  jobId: string
  currentStatus: JobStatus
}

export default function StatusUpdateDropdown({ jobId, currentStatus }: StatusUpdateDropdownProps) {
  const [open, setOpen] = useState(false)
  const transitions = allowedTransitions[currentStatus]

  if (!transitions || transitions.length === 0) return null

  function handleUpdate(next: JobStatus, label: string) {
    setOpen(false)
    toast(`Demo mode: Job would be updated to "${next}". Connect Supabase to save changes.`)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
      >
        Update Status
        <ChevronDown className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[160px]">
            {transitions.map((t) => (
              <button
                key={t.next}
                onClick={() => handleUpdate(t.next, t.label)}
                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
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
