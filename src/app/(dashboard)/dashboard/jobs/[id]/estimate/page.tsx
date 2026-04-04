'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Eye, EyeOff, FileText, Share2, Printer } from 'lucide-react'
import { toast } from '@/components/Toast'

interface EstimateLineItem {
  description: string
  category: string
  quantity: number
  unit: string
  your_cost: number
  markup_percent: number
  price_to_customer: number
  total_cost: number
  total_price: number
  retail_link?: string | null
}

interface EstimateData {
  job_id: string
  job_title: string
  client_name: string
  items: EstimateLineItem[]
  summary: {
    materials_cost: number
    materials_price: number
    labor_cost: number
    labor_price: number
    total_cost: number
    total_price: number
    profit: number
    profit_percent: number
  }
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

export default function EstimatePage() {
  const params = useParams()
  const jobId = params.id as string
  const [data, setData] = useState<EstimateData | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'internal' | 'external'>('internal')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/estimates?job_id=${jobId}`)
        if (!res.ok) throw new Error('Failed to load estimate')
        setData(await res.json())
      } catch {
        toast('Failed to load estimate', 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [jobId])

  if (loading) return <div className="text-center py-12 text-gray-500">Loading estimate...</div>
  if (!data) return <div className="text-center py-12 text-gray-500">No estimate data available</div>

  const materialItems = data.items.filter((i) => i.category === 'materials')
  const laborItems = data.items.filter((i) => i.category === 'labor')

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href={`/dashboard/jobs/${jobId}`}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Job
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Estimate</h1>
          <p className="text-sm text-gray-500">{data.job_title} — {data.client_name}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setView('internal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                view === 'internal' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <EyeOff className="w-3.5 h-3.5" />
              Internal
            </button>
            <button
              onClick={() => setView('external')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                view === 'external' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Customer
            </button>
          </div>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>

      {/* Internal View */}
      {view === 'internal' && (
        <div className="space-y-6">
          {/* Profit summary banner */}
          <div className={`rounded-xl p-4 ${data.summary.profit_percent >= 0.4 ? 'bg-green-50 border border-green-200' : data.summary.profit_percent >= 0.25 ? 'bg-yellow-50 border border-yellow-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Your Cost</p>
                <p className="text-xl font-bold text-gray-900">{fmt(data.summary.total_cost)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Customer Price</p>
                <p className="text-xl font-bold text-gray-900">{fmt(data.summary.total_price)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Profit</p>
                <p className="text-xl font-bold text-green-700">{fmt(data.summary.profit)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Margin</p>
                <p className={`text-xl font-bold ${data.summary.profit_percent >= 0.4 ? 'text-green-700' : data.summary.profit_percent >= 0.25 ? 'text-yellow-700' : 'text-red-700'}`}>
                  {pct(data.summary.profit_percent)}
                </p>
              </div>
            </div>
          </div>

          {/* Materials breakdown */}
          {materialItems.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-800">
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Materials</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
                      <th className="text-left px-4 py-2">Item</th>
                      <th className="text-right px-4 py-2">Qty</th>
                      <th className="text-right px-4 py-2">Your Cost</th>
                      <th className="text-right px-4 py-2">Markup</th>
                      <th className="text-right px-4 py-2">Customer</th>
                      <th className="text-right px-4 py-2">Total Cost</th>
                      <th className="text-right px-4 py-2">Total Price</th>
                      <th className="text-right px-4 py-2">Profit</th>
                      <th className="text-center px-4 py-2">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {materialItems.map((item, i) => (
                      <tr key={i} className="hover:bg-gray-50 text-sm">
                        <td className="px-4 py-2 font-medium text-gray-900">{item.description}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{item.quantity} {item.unit}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{fmt(item.your_cost)}</td>
                        <td className="px-4 py-2 text-right text-gray-500">{pct(item.markup_percent)}</td>
                        <td className="px-4 py-2 text-right text-gray-900">{fmt(item.price_to_customer)}</td>
                        <td className="px-4 py-2 text-right text-red-600">{fmt(item.total_cost)}</td>
                        <td className="px-4 py-2 text-right text-gray-900 font-medium">{fmt(item.total_price)}</td>
                        <td className="px-4 py-2 text-right text-green-600 font-medium">{fmt(item.total_price - item.total_cost)}</td>
                        <td className="px-4 py-2 text-center">
                          {item.retail_link ? (
                            <a href={item.retail_link} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700 text-xs">Link</a>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold text-sm">
                      <td className="px-4 py-2" colSpan={5}>Materials Subtotal</td>
                      <td className="px-4 py-2 text-right text-red-600">{fmt(data.summary.materials_cost)}</td>
                      <td className="px-4 py-2 text-right">{fmt(data.summary.materials_price)}</td>
                      <td className="px-4 py-2 text-right text-green-600">{fmt(data.summary.materials_price - data.summary.materials_cost)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Labor breakdown */}
          {laborItems.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-800">
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Labor</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
                      <th className="text-left px-4 py-2">Task</th>
                      <th className="text-right px-4 py-2">Qty</th>
                      <th className="text-right px-4 py-2">Your Cost/Unit</th>
                      <th className="text-right px-4 py-2">Markup</th>
                      <th className="text-right px-4 py-2">Customer/Unit</th>
                      <th className="text-right px-4 py-2">Total Cost</th>
                      <th className="text-right px-4 py-2">Total Price</th>
                      <th className="text-right px-4 py-2">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {laborItems.map((item, i) => (
                      <tr key={i} className="hover:bg-gray-50 text-sm">
                        <td className="px-4 py-2 font-medium text-gray-900">{item.description}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{item.quantity} {item.unit}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{fmt(item.your_cost)}</td>
                        <td className="px-4 py-2 text-right text-gray-500">{pct(item.markup_percent)}</td>
                        <td className="px-4 py-2 text-right text-gray-900">{fmt(item.price_to_customer)}</td>
                        <td className="px-4 py-2 text-right text-red-600">{fmt(item.total_cost)}</td>
                        <td className="px-4 py-2 text-right text-gray-900 font-medium">{fmt(item.total_price)}</td>
                        <td className="px-4 py-2 text-right text-green-600 font-medium">{fmt(item.total_price - item.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold text-sm">
                      <td className="px-4 py-2" colSpan={5}>Labor Subtotal</td>
                      <td className="px-4 py-2 text-right text-red-600">{fmt(data.summary.labor_cost)}</td>
                      <td className="px-4 py-2 text-right">{fmt(data.summary.labor_price)}</td>
                      <td className="px-4 py-2 text-right text-green-600">{fmt(data.summary.labor_price - data.summary.labor_cost)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* No line items fallback */}
          {data.items.length === 0 && data.summary.total_price > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <p className="text-sm text-gray-500 mb-4">No detailed line items. Showing job-level estimate:</p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Estimated Cost</p>
                  <p className="text-lg font-bold text-red-600">{fmt(data.summary.total_cost)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Quote Amount</p>
                  <p className="text-lg font-bold text-gray-900">{fmt(data.summary.total_price)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Profit</p>
                  <p className="text-lg font-bold text-green-700">{fmt(data.summary.profit)} ({pct(data.summary.profit_percent)})</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* External (Customer-Facing) View */}
      {view === 'external' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print:shadow-none print:border-0">
          {/* Company header */}
          <div className="px-6 py-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Aguirre Modern Tile</h2>
            <p className="text-sm text-gray-500">Professional Tile Installation — Revere, MA</p>
            <p className="text-sm text-gray-500">(617) 766-1259 · vin@moderntile.pro</p>
          </div>

          {/* Estimate info */}
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <div className="flex justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase">Prepared For</p>
                <p className="font-semibold text-gray-900">{data.client_name}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 uppercase">Date</p>
                <p className="font-semibold text-gray-900">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>
            <div className="mt-2">
              <p className="text-xs text-gray-500 uppercase">Project</p>
              <p className="font-semibold text-gray-900">{data.job_title}</p>
            </div>
          </div>

          {/* Line items — customer view (no cost/markup columns) */}
          {data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-xs font-semibold text-gray-500 uppercase">
                    <th className="text-left px-6 py-3">Description</th>
                    <th className="text-right px-6 py-3">Qty</th>
                    <th className="text-right px-6 py-3">Unit Price</th>
                    <th className="text-right px-6 py-3">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.items.map((item, i) => (
                    <tr key={i} className="text-sm">
                      <td className="px-6 py-3 text-gray-900">{item.description}</td>
                      <td className="px-6 py-3 text-right text-gray-600">{item.quantity} {item.unit}</td>
                      <td className="px-6 py-3 text-right text-gray-600">{fmt(item.price_to_customer)}</td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">{fmt(item.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-4">
              <p className="text-sm text-gray-700">Project estimate based on scope of work discussed.</p>
            </div>
          )}

          {/* Total */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-gray-700 uppercase">Total</span>
              <span className="text-2xl font-bold text-gray-900">{fmt(data.summary.total_price)}</span>
            </div>
          </div>

          {/* Terms */}
          <div className="px-6 py-4 text-xs text-gray-500 border-t border-gray-100">
            <p className="font-medium text-gray-700 mb-1">Payment Terms</p>
            <p>10% deposit to schedule · Progress payment at midpoint · Balance upon completion</p>
            <p className="mt-2">Estimate valid for 30 days. Price does not include tile, grout, or materials noted as customer-provided.</p>
          </div>
        </div>
      )}
    </div>
  )
}
