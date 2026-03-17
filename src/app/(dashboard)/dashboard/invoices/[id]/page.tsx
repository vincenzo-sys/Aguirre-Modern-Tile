'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Send, ExternalLink, CreditCard, FileText, RefreshCw, XCircle } from 'lucide-react'
import InvoiceStatusBadge from '@/components/dashboard/InvoiceStatusBadge'
import { toast } from '@/components/Toast'
import { getDemoInvoice } from '@/lib/demo'
import type { InvoiceWithJob, InvoiceLineItem } from '@/lib/supabase/types'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

const isDemoMode = !process.env.NEXT_PUBLIC_SUPABASE_URL

export default function InvoiceDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [invoice, setInvoice] = useState<InvoiceWithJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [sendingStripe, setSendingStripe] = useState(false)
  const [creatingDraft, setCreatingDraft] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [stripeInfo, setStripeInfo] = useState<{
    hosted_invoice_url?: string | null
    invoice_pdf?: string | null
  } | null>(null)

  useEffect(() => {
    if (isDemoMode) {
      setInvoice(getDemoInvoice(id) ?? null)
      setLoading(false)
      return
    }

    async function loadInvoice() {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data: inv, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !inv) {
        setLoading(false)
        return
      }

      // Fetch associated job
      let job = null
      if (inv.job_id) {
        const { data: jobData } = await supabase
          .from('jobs')
          .select('*')
          .eq('id', inv.job_id)
          .single()
        job = jobData
      }

      setInvoice({ ...inv, job } as InvoiceWithJob)
      setLoading(false)
    }

    loadInvoice()
  }, [id])

  async function handleMarkAs(newStatus: string) {
    if (isDemoMode) {
      toast(`Demo mode: Invoice would be marked as "${newStatus}". Connect Supabase to update real data.`)
      return
    }

    setUpdating(true)

    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update')
      }

      const updated = await res.json()
      setInvoice((prev) => prev ? { ...prev, status: updated.status } : prev)
      toast(`Invoice marked as ${newStatus}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update'
      toast(message, 'error')
    }

    setUpdating(false)
  }

  async function handleSendViaStripe() {
    if (isDemoMode) {
      toast('Demo mode: Connect Supabase and configure Stripe to send invoices.', 'error')
      return
    }

    setSendingStripe(true)

    try {
      const res = await fetch('/api/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: id }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send via Stripe')
      }

      setInvoice((prev) => prev ? {
        ...prev,
        status: 'sent' as const,
        stripe_invoice_id: data.stripe_invoice_id,
      } : prev)

      setStripeInfo({
        hosted_invoice_url: data.hosted_invoice_url,
        invoice_pdf: data.invoice_pdf,
      })

      toast('Invoice sent to customer via Stripe!')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send'
      toast(message, 'error')
    }

    setSendingStripe(false)
  }

  async function handleCreateDraft() {
    if (isDemoMode) {
      toast('Demo mode: Connect Supabase and configure Stripe to create drafts.', 'error')
      return
    }

    setCreatingDraft(true)

    try {
      const res = await fetch('/api/stripe/invoices/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: id }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create Stripe draft')
      }

      setInvoice((prev) => prev ? {
        ...prev,
        stripe_invoice_id: data.stripe_invoice_id,
      } : prev)

      toast('Stripe draft created — review in Stripe Dashboard, then finalize & send.')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create draft'
      toast(message, 'error')
    }

    setCreatingDraft(false)
  }

  async function handleFinalize() {
    if (isDemoMode) {
      toast('Demo mode: Connect Supabase and configure Stripe to finalize invoices.', 'error')
      return
    }

    setSendingStripe(true)

    try {
      const res = await fetch('/api/stripe/invoices/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: id }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to finalize')
      }

      setInvoice((prev) => prev ? { ...prev, status: 'sent' as const } : prev)

      setStripeInfo({
        hosted_invoice_url: data.hosted_invoice_url,
        invoice_pdf: data.invoice_pdf,
      })

      toast('Invoice finalized and sent to customer!')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to finalize'
      toast(message, 'error')
    }

    setSendingStripe(false)
  }

  async function handleSync() {
    if (isDemoMode) {
      toast('Demo mode: Connect Supabase and configure Stripe to sync status.', 'error')
      return
    }

    setSyncing(true)

    try {
      const res = await fetch('/api/stripe/invoices/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: id }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to sync')
      }

      if (data.synced) {
        setInvoice((prev) => prev ? { ...prev, status: data.local_status } : prev)
        toast(`Status updated to ${data.local_status}`)
      } else {
        toast('Status is up to date')
      }

      if (data.hosted_invoice_url || data.invoice_pdf) {
        setStripeInfo({
          hosted_invoice_url: data.hosted_invoice_url,
          invoice_pdf: data.invoice_pdf,
        })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to sync'
      toast(message, 'error')
    }

    setSyncing(false)
  }

  async function handleVoid() {
    if (isDemoMode) {
      toast('Demo mode: Connect Supabase and configure Stripe to void invoices.', 'error')
      return
    }

    setVoiding(true)

    try {
      const res = await fetch('/api/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: id, action: 'void' }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to void invoice')
      }

      setInvoice((prev) => prev ? { ...prev, status: 'void' as const } : prev)
      toast('Invoice voided')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to void'
      toast(message, 'error')
    }

    setVoiding(false)
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading invoice...</div>
  }

  if (!invoice) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Invoice not found.</p>
        <Link href="/dashboard/invoices" className="text-primary-600 hover:text-primary-700 text-sm mt-2 inline-block">
          Back to invoices
        </Link>
      </div>
    )
  }

  const hasStripe = !!invoice.stripe_invoice_id
  const anyLoading = updating || sendingStripe || creatingDraft || syncing || voiding

  return (
    <div className="max-w-3xl">
      <Link
        href="/dashboard/invoices"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to invoices
      </Link>

      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{invoice.invoice_number}</h1>
            {invoice.job && (
              <Link
                href={`/dashboard/jobs/${invoice.job.id}`}
                className="text-sm text-primary-600 hover:text-primary-700 mt-1 inline-block"
              >
                #{invoice.job.job_number} {invoice.job.title}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <InvoiceStatusBadge status={invoice.status} />

            {/* === DRAFT, no Stripe draft yet === */}
            {invoice.status === 'draft' && !hasStripe && (
              <>
                <button
                  onClick={handleCreateDraft}
                  disabled={anyLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  <FileText className="w-3.5 h-3.5" />
                  {creatingDraft ? 'Creating...' : 'Create Stripe Draft'}
                </button>
                <button
                  onClick={handleSendViaStripe}
                  disabled={anyLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sendingStripe ? 'Sending...' : 'Send via Stripe'}
                </button>
                <button
                  onClick={() => handleMarkAs('sent')}
                  disabled={anyLoading}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
                >
                  Mark as Sent
                </button>
              </>
            )}

            {/* === DRAFT, has Stripe draft — ready to finalize === */}
            {invoice.status === 'draft' && hasStripe && (
              <>
                <button
                  onClick={handleFinalize}
                  disabled={anyLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sendingStripe ? 'Finalizing...' : 'Finalize & Send'}
                </button>
                <button
                  onClick={handleVoid}
                  disabled={anyLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 bg-white rounded-md hover:bg-red-50 disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  {voiding ? 'Voiding...' : 'Void Draft'}
                </button>
              </>
            )}

            {/* === SENT, has Stripe — show sync + void + manual paid === */}
            {invoice.status === 'sent' && hasStripe && (
              <>
                <button
                  onClick={handleSync}
                  disabled={anyLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Checking...' : 'Check Payment Status'}
                </button>
                <button
                  onClick={handleVoid}
                  disabled={anyLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 bg-white rounded-md hover:bg-red-50 disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  {voiding ? 'Voiding...' : 'Void Invoice'}
                </button>
                <button
                  onClick={() => handleMarkAs('paid')}
                  disabled={anyLoading}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
                  title="Use if customer paid outside Stripe (cash, check, etc.)"
                >
                  Mark as Paid
                </button>
              </>
            )}

            {/* === SENT, no Stripe — manual paid === */}
            {invoice.status === 'sent' && !hasStripe && (
              <button
                onClick={() => handleMarkAs('paid')}
                disabled={anyLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                <CreditCard className="w-3.5 h-3.5" />
                Mark as Paid
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Amount</p>
            <p className="font-bold text-gray-900 text-lg">{fmt.format(invoice.amount)}</p>
          </div>
          <div>
            <p className="text-gray-500">Due Date</p>
            <p className="font-medium text-gray-900">
              {new Date(invoice.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          {invoice.job && (
            <div>
              <p className="text-gray-500">Client</p>
              <p className="font-medium text-gray-900">{invoice.job.client_name}</p>
              {invoice.job.client_email && (
                <p className="text-gray-400 text-xs">{invoice.job.client_email}</p>
              )}
            </div>
          )}
        </div>

        {/* Stripe info banner */}
        {hasStripe && (
          <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-indigo-600 flex-shrink-0" fill="currentColor">
                <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
              </svg>
              <span className="font-medium text-indigo-700">
                {invoice.status === 'draft' ? 'Stripe Draft Created' : 'Sent via Stripe'}
              </span>
              {invoice.status === 'draft' && hasStripe && (
                <span className="text-indigo-500">— Review in Stripe Dashboard before finalizing</span>
              )}
              {invoice.status === 'sent' && (
                <span className="text-indigo-500">— Waiting for customer payment</span>
              )}
              {invoice.status === 'paid' && (
                <span className="text-green-600">— Payment received</span>
              )}
              {invoice.status === 'void' && (
                <span className="text-gray-500">— Invoice voided</span>
              )}
            </div>
            {(stripeInfo?.hosted_invoice_url || stripeInfo?.invoice_pdf) && (
              <div className="mt-2 flex items-center gap-4 text-xs">
                {stripeInfo.hosted_invoice_url && (
                  <a
                    href={stripeInfo.hosted_invoice_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Customer payment page
                  </a>
                )}
                {stripeInfo.invoice_pdf && (
                  <a
                    href={stripeInfo.invoice_pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Download PDF
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Line Items */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
              {hasLineItemTypes(invoice.line_items) && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
              )}
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Qty</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Unit Price</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {invoice.line_items.map((item, i) => (
              <tr key={i}>
                <td className="px-6 py-3 text-sm text-gray-900">{item.description}</td>
                {hasLineItemTypes(invoice.line_items) && (
                  <td className="px-4 py-3">
                    {item.type && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        item.type === 'product'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {item.type === 'product' ? 'Material' : 'Labor'}
                      </span>
                    )}
                  </td>
                )}
                <td className="px-6 py-3 text-sm text-gray-600 text-right">
                  {item.quantity}
                  {item.unit && <span className="text-gray-400 ml-1">{item.unit}</span>}
                </td>
                <td className="px-6 py-3 text-sm text-gray-600 text-right">{fmt.format(item.unit_price)}</td>
                <td className="px-6 py-3 text-sm font-medium text-gray-900 text-right">{fmt.format(item.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td colSpan={hasLineItemTypes(invoice.line_items) ? 4 : 3} className="px-6 py-3 text-sm font-semibold text-gray-900 text-right">Total</td>
              <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right">{fmt.format(invoice.amount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Meta */}
      <div className="mt-6 text-xs text-gray-400 space-y-1">
        <p>Created {new Date(invoice.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
        <p>Updated {new Date(invoice.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
        {invoice.stripe_invoice_id && (
          <p className="text-indigo-400">Stripe ID: {invoice.stripe_invoice_id}</p>
        )}
      </div>
    </div>
  )
}

/** Check if any line items have the `type` field set */
function hasLineItemTypes(items: InvoiceLineItem[]): boolean {
  return items.some((item) => !!item.type)
}
