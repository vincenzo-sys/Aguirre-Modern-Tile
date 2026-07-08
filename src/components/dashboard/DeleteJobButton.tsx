'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2, AlertTriangle, X } from 'lucide-react'
import { toast } from '@/components/Toast'

export default function DeleteJobButton({
  jobId,
  jobNumber,
  jobTitle,
  amountPaid,
}: {
  jobId: string
  jobNumber: number
  jobTitle: string
  amountPaid: number
}) {
  const router = useRouter()
  const hasPayments = amountPaid > 0
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: hasPayments }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Delete failed')
      toast(`Job #${jobNumber} deleted`, 'success')
      router.push('/dashboard/leads/board')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'error')
      setLoading(false)
    }
  }

  const canConfirm = hasPayments ? typed.trim().toUpperCase() === 'DELETE' : true

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100"
        title="Delete this job"
      >
        <Trash2 className="w-4 h-4" />
        Delete
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div
            className="fixed inset-0"
            onClick={() => !loading && setOpen(false)}
            aria-hidden
          />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <h2 className="text-lg font-semibold text-gray-900">Delete job?</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-700">
                You&apos;re about to delete <strong>#{jobNumber} — {jobTitle}</strong>.
              </p>

              <div className="rounded-md bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 space-y-1">
                <p>• Job photos + linked invoices will also be deleted</p>
                <p>• Call and SMS history stays (unlinked from the job)</p>
                <p>• Originating lead re-opens as active</p>
              </div>

              {hasPayments && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3 space-y-2">
                  <p className="text-sm font-semibold text-red-900 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    This job has ${amountPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })} recorded as paid.
                  </p>
                  <p className="text-xs text-red-800">
                    Deleting will remove the Supabase record. Stripe payment history is unaffected.
                    Type <strong>DELETE</strong> to confirm.
                  </p>
                  <input
                    type="text"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    disabled={loading}
                    placeholder="Type DELETE to confirm"
                    className="w-full px-3 py-2 border border-red-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={loading || !canConfirm}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete job
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
