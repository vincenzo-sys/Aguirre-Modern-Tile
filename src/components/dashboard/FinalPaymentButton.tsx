'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DollarSign, Loader2, X, CheckCircle2 } from 'lucide-react'
import { toast } from '@/components/Toast'

type Method = 'cash' | 'check' | 'stripe' | 'zelle' | 'venmo' | 'other'

const METHOD_OPTIONS: { value: Method; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'stripe', label: 'Stripe / card' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'other', label: 'Other' },
]

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n)
}

export default function FinalPaymentButton({
  jobId,
  estimatedCost,
  amountPaid,
  variant = 'default',
  alreadyReceived = false,
}: {
  jobId: string
  estimatedCost: number | null
  amountPaid: number
  variant?: 'default' | 'compact'
  alreadyReceived?: boolean
}) {
  const router = useRouter()
  const balance = Math.max(0, Number(estimatedCost ?? 0) - amountPaid)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState<string>(balance > 0 ? balance.toFixed(2) : '')
  const [method, setMethod] = useState<Method>('cash')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    const amt = Number(amount)
    if (!amt || amt <= 0) {
      toast('Enter a positive amount', 'error')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/final-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, method, note }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to record payment')
      const data = await res.json()
      toast(
        data.status_changed
          ? `Payment recorded — job marked paid ($${Number(data.new_amount_paid).toFixed(2)} total)`
          : `Payment recorded ($${Number(data.new_amount_paid).toFixed(2)} of ${formatCurrency(Number(estimatedCost ?? 0))})`,
        'success'
      )
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  const buttonCls =
    variant === 'compact'
      ? 'inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border'
      : 'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg'
  const buttonStyle = alreadyReceived
    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
    : 'bg-green-600 text-white hover:bg-green-700 border-green-600'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${buttonCls} ${buttonStyle}`}
      >
        {alreadyReceived ? (
          <>
            <CheckCircle2 className="w-4 h-4" />
            Payment received
          </>
        ) : (
          <>
            <DollarSign className="w-4 h-4" />
            Mark final payment
          </>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div
            className="fixed inset-0"
            onClick={() => !loading && setOpen(false)}
            aria-hidden
          />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {alreadyReceived ? 'Record another payment' : 'Record final payment'}
              </h2>
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {estimatedCost !== null && (
                <div className="rounded-md bg-gray-50 border border-gray-200 p-3 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Total estimated</span>
                    <span>{formatCurrency(Number(estimatedCost))}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Paid so far</span>
                    <span>{formatCurrency(amountPaid)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-gray-200 mt-1">
                    <span>Balance</span>
                    <span>{formatCurrency(balance)}</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={loading}
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Method</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as Method)}
                  disabled={loading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500"
                >
                  {METHOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Note <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={loading}
                  placeholder="e.g. Check #1042, paid in full on site"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
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
                onClick={handleSubmit}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Record payment
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
