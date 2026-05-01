'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, AlertCircle, Loader2, Clock, ShieldCheck, X } from 'lucide-react'
import { toast } from '@/components/Toast'

// Two-faced component:
//   Owner view  — "Request Christian's approval" button + status badge.
//                 The badge shows last result (pending/approved/rejected)
//                 with timestamp and notes.
//   Crew view   — when status='pending', shows a prominent banner with
//                 Approve / Needs changes buttons + optional notes input.
//                 Otherwise shows a passive history badge.
//
// We intentionally render NOTHING when the job has never been requested
// AND the viewer is crew — Christian doesn't need the noise on every
// random job, only the ones Vince asked him to look at.

type Status = 'pending' | 'approved' | 'rejected' | null

interface Props {
  jobId: string
  isOwner: boolean
  status: Status
  notes: string | null
  requestedAt: string | null
  approvedAt: string | null
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function CrewApprovalCard({
  jobId,
  isOwner,
  status,
  notes,
  requestedAt,
  approvedAt,
}: Props) {
  const router = useRouter()
  const [requesting, setRequesting] = useState(false)
  const [responding, setResponding] = useState<'approved' | 'rejected' | null>(null)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectNotes, setRejectNotes] = useState('')

  // Crew view, never been requested → render nothing.
  if (!isOwner && !status) return null

  async function requestApproval() {
    setRequesting(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/request-crew-approval`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Request failed')
      toast('Approval request sent to Christian', 'success')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Request failed', 'error')
    } finally {
      setRequesting(false)
    }
  }

  async function respond(decision: 'approved' | 'rejected', responseNotes = '') {
    setResponding(decision)
    try {
      const res = await fetch(`/api/jobs/${jobId}/crew-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: decision, notes: responseNotes }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Save failed')
      toast(decision === 'approved' ? 'Approved · Vince notified' : 'Flagged · Vince notified', 'success')
      setShowRejectForm(false)
      setRejectNotes('')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setResponding(null)
    }
  }

  // ── Crew banner (pending) ──
  if (!isOwner && status === 'pending') {
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">Vince needs your approval</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Review the price + line items below. Tap a button when ready.
            </p>
          </div>
        </div>

        {!showRejectForm ? (
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => respond('approved')}
              disabled={responding !== null}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-green-600 text-white rounded-lg font-semibold text-sm hover:bg-green-700 active:scale-95 disabled:opacity-50 transition min-h-[44px]"
            >
              {responding === 'approved' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Approve
            </button>
            <button
              type="button"
              onClick={() => setShowRejectForm(true)}
              disabled={responding !== null}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white text-red-700 border-2 border-red-300 rounded-lg font-semibold text-sm hover:bg-red-50 active:scale-95 disabled:opacity-50 transition min-h-[44px]"
            >
              <AlertCircle className="w-4 h-4" />
              Needs changes
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              rows={3}
              placeholder="What needs to change? (price too low, scope missing, materials wrong...)"
              className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => respond('rejected', rejectNotes)}
                disabled={responding !== null || !rejectNotes.trim()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-600 text-white rounded-lg font-semibold text-sm hover:bg-red-700 active:scale-95 disabled:opacity-50 transition"
              >
                {responding === 'rejected' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Send to Vince
              </button>
              <button
                type="button"
                onClick={() => { setShowRejectForm(false); setRejectNotes('') }}
                className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Owner button + status ──
  if (isOwner) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Crew approval</p>
            <StatusBadge status={status} requestedAt={requestedAt} approvedAt={approvedAt} />
            {notes && status === 'rejected' && (
              <p className="text-sm text-red-700 mt-2 italic">&ldquo;{notes}&rdquo;</p>
            )}
          </div>
          <button
            type="button"
            onClick={requestApproval}
            disabled={requesting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition"
          >
            {requesting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            {status === 'approved' ? 'Re-request' : status === 'pending' ? 'Re-send SMS' : 'Request Christian’s approval'}
          </button>
        </div>
      </div>
    )
  }

  // ── Crew view, already approved/rejected — passive badge only ──
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Your decision</p>
      <StatusBadge status={status} requestedAt={requestedAt} approvedAt={approvedAt} />
    </div>
  )
}

function StatusBadge({
  status,
  requestedAt,
  approvedAt,
}: {
  status: Status
  requestedAt: string | null
  approvedAt: string | null
}) {
  if (!status) {
    return <p className="text-sm text-gray-500 mt-1">Not yet requested</p>
  }
  if (status === 'pending') {
    return (
      <p className="text-sm text-amber-700 mt-1 inline-flex items-center gap-1.5">
        <Clock className="w-4 h-4" />
        Pending · sent {relativeTime(requestedAt)}
      </p>
    )
  }
  if (status === 'approved') {
    return (
      <p className="text-sm text-green-700 mt-1 inline-flex items-center gap-1.5">
        <CheckCircle2 className="w-4 h-4" />
        Approved {relativeTime(approvedAt)}
      </p>
    )
  }
  return (
    <p className="text-sm text-red-700 mt-1 inline-flex items-center gap-1.5">
      <X className="w-4 h-4" />
      Flagged for changes {relativeTime(approvedAt)}
    </p>
  )
}
