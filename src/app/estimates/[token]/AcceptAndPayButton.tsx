'use client'

import { useState } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

export default function AcceptAndPayButton({
  token,
  depositAmount,
  compact = false,
}: {
  token: string
  depositAmount: number
  compact?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function accept() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/public/estimates/${token}/checkout`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Could not start checkout')
      }
      window.location.href = data.url as string
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  const sizing = compact
    ? 'px-4 py-3 text-sm'
    : 'px-8 py-4 text-base'
  const icon = compact ? 'w-4 h-4' : 'w-5 h-5'

  return (
    <div>
      <button
        type="button"
        onClick={accept}
        disabled={loading || depositAmount <= 0}
        className={`inline-flex items-center gap-2 ${sizing} bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50`}
      >
        {loading ? (
          <>
            <Loader2 className={`${icon} animate-spin`} />
            {compact ? 'Redirecting…' : 'Redirecting to payment...'}
          </>
        ) : (
          <>
            <CheckCircle2 className={icon} />
            {compact ? 'Accept & Pay' : `Accept & Pay ${formatCurrency(depositAmount)} Deposit`}
          </>
        )}
      </button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  )
}
