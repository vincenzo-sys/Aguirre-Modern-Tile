'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { demoJobs } from '@/lib/demo'
import { toast } from '@/components/Toast'
import type { InvoiceLineItem } from '@/lib/supabase/types'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

const emptyLine: InvoiceLineItem = { description: '', quantity: 1, unit_price: 0, amount: 0 }

export default function NewInvoicePage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-500">Loading...</div>}>
      <NewInvoiceForm />
    </Suspense>
  )
}

function NewInvoiceForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedJobId = searchParams.get('job') || ''

  const [jobId, setJobId] = useState(preselectedJobId)
  const [dueDate, setDueDate] = useState('')
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([{ ...emptyLine }])
  const [loading, setLoading] = useState(false)

  const selectedJob = demoJobs.find((j) => j.id === jobId)

  function updateLine(index: number, field: keyof InvoiceLineItem, value: string | number) {
    setLineItems((prev) => {
      const next = [...prev]
      const line = { ...next[index] }
      if (field === 'description') {
        line.description = value as string
      } else {
        const num = typeof value === 'string' ? parseFloat(value) || 0 : value
        if (field === 'quantity') line.quantity = num
        if (field === 'unit_price') line.unit_price = num
      }
      line.amount = line.quantity * line.unit_price
      next[index] = line
      return next
    })
  }

  function addLine() {
    setLineItems((prev) => [...prev, { ...emptyLine }])
  }

  function removeLine(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  const total = lineItems.reduce((sum, l) => sum + l.amount, 0)

  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (total <= 0) {
      setError('Invoice total must be greater than $0')
      return
    }

    setLoading(true)
    toast('Demo mode: Invoice would be created. Connect Supabase to save real data.')
    setLoading(false)
    router.push('/dashboard/invoices')
  }

  const inputClass =
    'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 text-sm'
  const labelClass = 'block text-sm font-medium text-gray-700'

  return (
    <div className="max-w-3xl">
      <Link
        href="/dashboard/invoices"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to invoices
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Invoice</h1>

      <div className="mb-6 rounded-md bg-amber-50 border border-amber-200 p-3">
        <p className="text-sm text-amber-800">
          <strong>Demo Mode</strong> — Form is functional but won't save. Connect Supabase to create real invoices.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Job + Due Date */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Invoice Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="job" className={labelClass}>Job *</label>
              <select
                id="job"
                required
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className={inputClass}
              >
                <option value="">Select a job...</option>
                {demoJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    #{j.job_number} {j.title} — {j.client_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="due_date" className={labelClass}>Due Date *</label>
              <input
                id="due_date"
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          {selectedJob?.estimated_cost && (
            <p className="mt-2 text-xs text-gray-500">
              Job estimated cost: {fmt.format(selectedJob.estimated_cost)}
            </p>
          )}
        </section>

        {/* Line Items */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Line Items</h2>
          <div className="space-y-3">
            {lineItems.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  {i === 0 && <label className="text-xs text-gray-500">Description</label>}
                  <input
                    type="text"
                    required
                    value={line.description}
                    onChange={(e) => updateLine(i, 'description', e.target.value)}
                    className={inputClass}
                    placeholder="Description"
                  />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="text-xs text-gray-500">Qty</label>}
                  <input
                    type="number"
                    min="1"
                    required
                    value={line.quantity}
                    onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="text-xs text-gray-500">Unit Price</label>}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={line.unit_price || ''}
                    onChange={(e) => updateLine(i, 'unit_price', e.target.value)}
                    className={inputClass}
                    placeholder="0.00"
                  />
                </div>
                <div className="col-span-2">
                  {i === 0 && <label className="text-xs text-gray-500">Amount</label>}
                  <p className="mt-1 px-3 py-2 text-sm font-medium text-gray-900">
                    {fmt.format(line.amount)}
                  </p>
                </div>
                <div className="col-span-1">
                  {lineItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      className="mt-1 p-2 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addLine}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            <Plus className="w-4 h-4" />
            Add Line Item
          </button>

          <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end">
            <div className="text-right">
              <p className="text-sm text-gray-500">Total</p>
              <p className="text-2xl font-bold text-gray-900">{fmt.format(total)}</p>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-md bg-red-50 p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Invoice'}
          </button>
          <Link
            href="/dashboard/invoices"
            className="px-6 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
