'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, DollarSign, Loader2, X } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { Job } from '@/lib/supabase/types'

export default function DepositReceivedAction({ job }: { job: Job }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const alreadyReceived = (job.amount_paid ?? 0) > 0
  const canAct = !alreadyReceived && (job.status === 'lead' || job.status === 'quoted')

  const defaultAmount = job.estimated_cost
    ? Math.round(Number(job.estimated_cost) * 0.1)
    : 0
  const [amount, setAmount] = useState(String(defaultAmount || ''))

  if (!canAct) return null

  async function submit() {
    const num = parseFloat(amount)
    if (isNaN(num) || num <= 0) {
      toast('Enter a deposit amount', 'error')
      return
    }
    setSaving(true)
    try {
      const updates: Record<string, unknown> = {
        amount_paid: num,
      }
      // Stamp the deposit-paid timestamp if not already set so the customer-
      // facing estimate page and the dashboard show the same payment date
      // regardless of whether the deposit came through Stripe or was logged
      // here by hand (cash, check, Venmo).
      if (!job.estimate_accepted_at) {
        updates.estimate_accepted_at = new Date().toISOString()
      }
      // If there's already a scheduled date, advance status to 'scheduled'
      if (job.scheduled_start) {
        updates.status = 'scheduled'
      }
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error('Failed to record')
      toast(
        job.scheduled_start
          ? 'Deposit recorded · job sent to ops'
          : 'Deposit recorded · pick a start date to send to ops'
      )
      setOpen(false)
      router.refresh()
    } catch (err) {
      console.error(err)
      toast('Failed to record deposit', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
      >
        <CheckCircle2 className="w-4 h-4" />
        Deposit received
      </button>
    )
  }

  return (
    <div className="inline-flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
      <div className="relative">
        <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !saving) submit()
          }}
          className="w-32 pl-7 pr-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder={String(defaultAmount || '0')}
          autoFocus
        />
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
        Confirm
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        disabled={saving}
        className="p-1.5 text-gray-400 hover:text-gray-600"
        title="Cancel"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
