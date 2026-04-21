import { notFound } from 'next/navigation'
import type { JobLineItem } from '@/lib/supabase/types'
import AcceptAndPayButton from './AcceptAndPayButton'

type EstimateResponse = {
  title: string
  client_name: string
  client_address: string | null
  job_type: string | null
  square_footage: number | null
  scope_notes: string | null
  customer_provides: string | null
  line_items: JobLineItem[]
  estimated_cost: number | null
  deposit_amount: number
  amount_paid: number
  accepted: boolean
  already_viewed: boolean
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

async function fetchEstimate(token: string): Promise<EstimateResponse | null> {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    'http://localhost:3100'
  const res = await fetch(`${baseUrl}/api/public/estimates/${token}`, {
    cache: 'no-store',
  })
  if (!res.ok) return null
  return (await res.json()) as EstimateResponse
}

export default async function EstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ deposit?: string; session_id?: string }>
}) {
  const { token } = await params
  const { deposit } = await searchParams

  const estimate = await fetchEstimate(token)
  if (!estimate) notFound()

  const depositSuccess = deposit === 'success' || estimate.accepted
  const depositCancelled = deposit === 'cancelled'

  const materials = estimate.line_items.filter((i) => i.category === 'materials')
  const labor = estimate.line_items.filter((i) => i.category === 'labor')
  const materialsTotal = materials.reduce((s, i) => s + (i.amount ?? 0), 0)
  const laborTotal = labor.reduce((s, i) => s + (i.amount ?? 0), 0)
  const total = estimate.estimated_cost ?? materialsTotal + laborTotal

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gray-900 text-white">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <h1 className="text-2xl sm:text-3xl font-bold">Aguirre Modern Tile</h1>
          <p className="text-gray-400 text-sm mt-1">
            Estimate for {estimate.client_name}
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {/* Success banner */}
        {depositSuccess && (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-5">
            <h2 className="text-lg font-semibold text-green-900 mb-1">
              Deposit received — thank you!
            </h2>
            <p className="text-sm text-green-800">
              Your install date is reserved. We'll be in touch to confirm the schedule.
            </p>
          </div>
        )}

        {/* Cancelled banner */}
        {depositCancelled && !depositSuccess && (
          <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
            <p className="text-sm text-yellow-900">
              Payment was cancelled. You can accept and pay the deposit anytime below.
            </p>
          </div>
        )}

        {/* Project */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900">{estimate.title}</h2>
          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 text-sm">
            {estimate.job_type && (
              <div>
                <dt className="text-gray-500">Project type</dt>
                <dd className="text-gray-900">{estimate.job_type}</dd>
              </div>
            )}
            {estimate.square_footage && (
              <div>
                <dt className="text-gray-500">Area</dt>
                <dd className="text-gray-900">{estimate.square_footage} sq ft</dd>
              </div>
            )}
            {estimate.client_address && (
              <div className="sm:col-span-2">
                <dt className="text-gray-500">Address</dt>
                <dd className="text-gray-900">{estimate.client_address}</dd>
              </div>
            )}
          </dl>

          {estimate.scope_notes && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Scope of work
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{estimate.scope_notes}</p>
            </div>
          )}

          {estimate.customer_provides && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                You'll be providing
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {estimate.customer_provides}
              </p>
            </div>
          )}
        </section>

        {/* Line items */}
        {estimate.line_items.length > 0 && (
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
            <div className="px-6 py-3 bg-gray-100 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                Pricing breakdown
              </h3>
            </div>

            {materials.length > 0 && (
              <div>
                <div className="px-6 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Materials</span>
                  <span className="text-xs text-gray-500">{formatCurrency(materialsTotal)}</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {materials.map((item, i) => (
                    <div key={i} className="px-6 py-3 flex items-start justify-between text-sm gap-4">
                      <div className="flex-1">
                        <p className="text-gray-900">{item.description}</p>
                        <p className="text-xs text-gray-500">
                          {item.quantity} {item.unit} × {formatCurrency(item.unit_price)}
                        </p>
                        {item.source_url && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            Source:{' '}
                            <a
                              href={item.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary-600 hover:text-primary-800 underline"
                            >
                              {item.source_name || 'View product'}
                            </a>
                          </p>
                        )}
                      </div>
                      <span className="font-medium text-gray-900 whitespace-nowrap">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {labor.length > 0 && (
              <div>
                <div className="px-6 py-2 bg-gray-50 border-b border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Labor</span>
                  <span className="text-xs text-gray-500">{formatCurrency(laborTotal)}</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {labor.map((item, i) => (
                    <div key={i} className="px-6 py-3 flex items-start justify-between text-sm gap-4">
                      <div className="flex-1">
                        <p className="text-gray-900">{item.description}</p>
                        <p className="text-xs text-gray-500">
                          {item.quantity} {item.unit} × {formatCurrency(item.unit_price)}
                        </p>
                        {item.source_url && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            Source:{' '}
                            <a
                              href={item.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary-600 hover:text-primary-800 underline"
                            >
                              {item.source_name || 'View product'}
                            </a>
                          </p>
                        )}
                      </div>
                      <span className="font-medium text-gray-900 whitespace-nowrap">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Total + deposit */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-gray-500">Total estimate</span>
            <span className="text-3xl font-bold text-gray-900">{formatCurrency(total)}</span>
          </div>
          <div className="flex items-baseline justify-between pt-3 border-t border-gray-100">
            <span className="text-gray-700 font-medium">
              10% deposit to reserve your install date
            </span>
            <span className="text-xl font-semibold text-primary-700">
              {formatCurrency(estimate.deposit_amount)}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            The remainder is due on completion of the project.
          </p>
        </section>

        {/* Accept / pay */}
        {!depositSuccess && (
          <section className="bg-primary-50 rounded-xl border border-primary-200 p-6 text-center">
            <h3 className="text-lg font-semibold text-primary-900 mb-1">
              Ready to move forward?
            </h3>
            <p className="text-sm text-primary-800 mb-5">
              Accept the estimate and pay the deposit in one step — secured by Stripe.
            </p>
            <AcceptAndPayButton
              token={token}
              depositAmount={estimate.deposit_amount}
            />
          </section>
        )}

        <p className="text-xs text-gray-400 text-center mt-8">
          Questions? Reply to the email with this link, or call (617) 766-1259.
        </p>
      </main>
    </div>
  )
}
