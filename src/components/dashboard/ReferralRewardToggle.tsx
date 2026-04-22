'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from '@/components/Toast'

export default function ReferralRewardToggle({
  customerId,
  initial,
}: {
  customerId: string
  initial: boolean
}) {
  const router = useRouter()
  const [checked, setChecked] = useState(initial)
  const [saving, setSaving] = useState(false)

  async function handleToggle(next: boolean) {
    setChecked(next)
    setSaving(true)
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referral_reward_paid: next }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save')
      toast(next ? 'Marked reward paid' : 'Marked reward unpaid', 'success')
      router.refresh()
    } catch (err) {
      setChecked(!next)
      toast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-gray-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => handleToggle(e.target.checked)}
        disabled={saving}
        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
      />
      <span>{checked ? 'Reward paid' : 'Reward pending'}</span>
      {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
    </label>
  )
}
