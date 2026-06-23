import { notFound } from 'next/navigation'
import type { InvoiceLineItem } from '@/lib/supabase/types'
import { ShieldCheck, BadgeCheck, Phone, CheckCircle2 } from 'lucide-react'
import PrintButton from '@/components/PrintButton'

type InvoiceResponse = {
  invoice_number: string
  job_title: string | null
  client_name: string | null
  client_address: string | null
  line_items: InvoiceLineItem[]
  amount: number
  status: string
  due_date: string
  pay_url: string | null
  paid: boolean
}

const COMPANY_PHONE = '(617) 766-1259'
const COMPANY_PHONE_TEL = '+16177661259'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

async function fetchInvoice(token: string): Promise<InvoiceResponse | null> {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'http://localhost:3100'
  const res = await fetch(`${baseUrl}/api/public/invoices/${token}`, {
    cache: 'no-store',
  })
  if (!res.ok) return null
  return (await res.json()) as InvoiceResponse
}

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const invoice = await fetchInvoice(token)
  if (!invoice) notFound()

  const total =
    invoice.amount ||
    invoice.line_items.reduce((s, i) => s + (i.amount ?? 0), 0)

  return (
    <div className="min-h-screen bg-gray-50 pb-28 md:pb-8">
      {/* Header */}
      <header className="bg-gray-900 text-white doc-print-header">
        <div className="max-w-3xl mx-auto px-6 py-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Aguirre Modern Tile
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                Invoice {invoice.invoice_number}
                {invoice.client_name ? ` for ${invoice.client_name}` : ''}
              </p>
            </div>
            <a
              href={`tel:${COMPANY_PHONE_TEL}`}
              className="hidden sm:inline-flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors no-print"
            >
              <Phone className="w-4 h-4" />
              {COMPANY_PHONE}
            </a>
          </div>
        </div>

        {/* Trust band */}
        <div className="border-t border-gray-800/80">
          <div className="max-w-3xl mx-auto px-6 py-3 flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-2 text-xs text-gray-300">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-gray-400" />
              Licensed &amp; Insured
            </span>
            <span className="h-3 w-px bg-gray-700 hidden sm:block" />
            <span className="inline-flex items-center gap-1.5">
              <BadgeCheck className="w-3.5 h-3.5 text-gray-400" />
              Greater Boston tile specialists
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {/* Paid banner */}
        {invoice.paid && (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-5 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-700 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold text-green-900">Paid in full — thank you!</h2>
              <p className="text-sm text-green-800 mt-0.5">
                This invoice has been paid. No further action is needed.
              </p>
            </div>
          </div>
        )}

        {/* Invoice meta */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {invoice.job_title || 'Tile project'}
              </h2>
              <dl className="mt-3 space-y-1 text-sm">
                {invoice.client_name && (
                  <div className="flex gap-2">
                    <dt className="text-gray-500 w-16">Bill to</dt>
                    <dd className="text-gray-900">{invoice.client_name}</dd>
                  </div>
                )}
                {invoice.client_address && (
                  <div className="flex gap-2">
                    <dt className="text-gray-500 w-16">Address</dt>
                    <dd className="text-gray-900">{invoice.client_address}</dd>
                  </div>
                )}
                <div className="flex gap-2">
                  <dt className="text-gray-500 w-16">Due</dt>
                  <dd className="text-gray-900">{formatDate(invoice.due_date)}</dd>
                </div>
              </dl>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Invoice</p>
              <p className="text-lg font-semibold text-gray-900">{invoice.invoice_number}</p>
            </div>
          </div>
        </section>

        {/* Line items */}
        {invoice.line_items.length > 0 && (
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
            <div className="px-6 py-3 bg-gray-100 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                Line items
              </h3>
            </div>
            <div className="divide-y divide-gray-100">
              {invoice.line_items.map((item, idx) => (
                <div
                  key={idx}
                  className="px-6 py-3 flex items-start justify-between gap-4 break-inside-avoid"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">{item.description}</p>
                    {(item.quantity > 1 || (item.unit && item.unit.trim())) && (
                      <p className="text-xs text-gray-500">
                        {item.quantity} {item.unit || ''} &times;{' '}
                        {formatCurrency(item.unit_price)}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Total */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-baseline justify-between">
            <span className="text-gray-500">{invoice.paid ? 'Amount paid' : 'Amount due'}</span>
            <span className="text-3xl font-bold text-gray-900">{formatCurrency(total)}</span>
          </div>
          {!invoice.paid && (
            <p className="text-xs text-gray-500 mt-2">Due {formatDate(invoice.due_date)}.</p>
          )}
        </section>

        {/* Actions */}
        <section className="flex flex-col sm:flex-row items-stretch gap-3 no-print">
          {invoice.pay_url && !invoice.paid && (
            <a
              href={invoice.pay_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-lg font-semibold text-sm hover:bg-primary-700 active:scale-95 transition"
            >
              Pay now — secured by Stripe
            </a>
          )}
          <PrintButton
            label="Download PDF"
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-white text-gray-700 border-2 border-gray-300 rounded-lg font-semibold text-sm hover:bg-gray-50 active:scale-95 transition"
          />
        </section>

        {/* Questions */}
        <div className="mt-8 text-center no-print">
          <p className="text-sm text-gray-600 mb-2">Questions about this invoice?</p>
          <a
            href={`tel:${COMPANY_PHONE_TEL}`}
            className="inline-flex items-center gap-2 text-primary-700 font-semibold text-sm"
          >
            <Phone className="w-4 h-4" />
            Call {COMPANY_PHONE}
          </a>
          <p className="text-xs text-gray-400 mt-1">Small team — Vince picks up.</p>
        </div>
      </main>

      {/* Sticky mobile pay CTA */}
      {invoice.pay_url && !invoice.paid && (
        <div className="fixed bottom-0 left-0 right-0 md:hidden bg-white border-t border-gray-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] z-20 no-print">
          <div className="flex items-center justify-between gap-3 max-w-3xl mx-auto">
            <div className="flex-shrink-0">
              <div className="text-[11px] text-gray-500 leading-tight">Amount due</div>
              <div className="text-lg font-semibold text-gray-900 leading-tight">
                {formatCurrency(total)}
              </div>
            </div>
            <a
              href={invoice.pay_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-primary-600 text-white rounded-lg font-semibold text-sm hover:bg-primary-700 active:scale-95 transition"
            >
              Pay now
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
