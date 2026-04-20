'use client'

import { useEffect, useState } from 'react'
import { Package, ShoppingCart, Truck, CheckCircle2 } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { JobLineItem, MaterialStatus } from '@/lib/supabase/types'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

const statusMeta: Record<MaterialStatus, { label: string; icon: typeof Package; className: string }> = {
  needed: { label: 'Needed', icon: Package, className: 'bg-gray-100 text-gray-700' },
  ordered: { label: 'Ordered', icon: ShoppingCart, className: 'bg-blue-100 text-blue-700' },
  received: { label: 'Received', icon: Truck, className: 'bg-yellow-100 text-yellow-700' },
  on_site: { label: 'On site', icon: CheckCircle2, className: 'bg-green-100 text-green-700' },
}

const statusOrder: MaterialStatus[] = ['needed', 'ordered', 'received', 'on_site']

function nextStatus(current: MaterialStatus | undefined): MaterialStatus {
  const idx = statusOrder.indexOf(current ?? 'needed')
  return statusOrder[(idx + 1) % statusOrder.length]
}

export default function JobLineItems({
  items,
  jobId,
}: {
  items: JobLineItem[]
  jobId?: string
}) {
  const [liveItems, setLiveItems] = useState<JobLineItem[]>(items ?? [])
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    setLiveItems(items ?? [])
  }, [items])

  const materials = liveItems.filter((i) => i.category === 'materials')
  const labor = liveItems.filter((i) => i.category === 'labor')

  const materialsTotal = materials.reduce((sum, i) => sum + (i.amount ?? 0), 0)
  const laborTotal = labor.reduce((sum, i) => sum + (i.amount ?? 0), 0)
  const grandTotal = materialsTotal + laborTotal

  async function cycleStatus(index: number) {
    if (!jobId) return
    const target = liveItems[index]
    if (target.category !== 'materials') return

    const updated = liveItems.map((it, i) =>
      i === index ? { ...it, status: nextStatus(it.status) } : it
    )

    const original = liveItems
    setLiveItems(updated)
    setUpdating(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_items: updated }),
      })
      if (!res.ok) throw new Error('Failed to update')
    } catch (err) {
      console.error(err)
      setLiveItems(original)
      toast('Failed to update material status', 'error')
    } finally {
      setUpdating(false)
    }
  }

  if (liveItems.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-800">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Line Items</h3>
        </div>
        <div className="p-6 text-center text-gray-400 text-sm">
          No line items yet. Add items to build the scope of work.
        </div>
      </div>
    )
  }

  const materialStatusCounts: Record<MaterialStatus, number> = {
    needed: 0,
    ordered: 0,
    received: 0,
    on_site: 0,
  }
  for (const m of materials) {
    materialStatusCounts[m.status ?? 'needed']++
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-800">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Line Items</h3>
      </div>

      {/* Materials */}
      {materials.length > 0 && (
        <div>
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Materials</span>
            <div className="flex items-center gap-2">
              {jobId && (
                <div className="flex items-center gap-1 text-[11px] text-gray-500">
                  <span>{materialStatusCounts.needed} needed</span>
                  <span>·</span>
                  <span>{materialStatusCounts.ordered} ordered</span>
                  <span>·</span>
                  <span>{materialStatusCounts.on_site + materialStatusCounts.received} ready</span>
                </div>
              )}
              <span className="text-xs font-medium text-gray-500">{formatCurrency(materialsTotal)}</span>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {liveItems.map((item, i) => {
              if (item.category !== 'materials') return null
              const status = item.status ?? 'needed'
              const meta = statusMeta[status]
              const Icon = meta.icon

              return (
                <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{item.description}</p>
                    <p className="text-xs text-gray-500">
                      {item.quantity} {item.unit} &times; {formatCurrency(item.unit_price)}/{item.unit}
                    </p>
                  </div>
                  {jobId ? (
                    <button
                      type="button"
                      onClick={() => cycleStatus(i)}
                      disabled={updating}
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${meta.className} hover:opacity-80 disabled:opacity-50 shrink-0`}
                      title="Click to cycle status"
                    >
                      <Icon className="w-3 h-3" />
                      {meta.label}
                    </button>
                  ) : null}
                  <span className="text-sm font-medium text-gray-900 w-24 text-right shrink-0">
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Labor */}
      {labor.length > 0 && (
        <div>
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Labor</span>
            <span className="text-xs font-medium text-gray-500">{formatCurrency(laborTotal)}</span>
          </div>
          <div className="divide-y divide-gray-100">
            {labor.map((item, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.description}</p>
                  <p className="text-xs text-gray-500">
                    {item.quantity} {item.unit} &times; {formatCurrency(item.unit_price)}/{item.unit}
                  </p>
                </div>
                <span className="text-sm font-medium text-gray-900">{formatCurrency(item.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Total */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          {materials.length > 0 && labor.length > 0 && (
            <div className="text-xs text-gray-500">
              Materials: {formatCurrency(materialsTotal)} &middot; Labor: {formatCurrency(laborTotal)}
            </div>
          )}
          <div className="ml-auto text-right">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Total</span>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(grandTotal)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
