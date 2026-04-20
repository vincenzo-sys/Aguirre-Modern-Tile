'use client'

import { useEffect, useMemo, useState } from 'react'
import { Package, ShoppingCart, Truck, CheckCircle2, Trash2, Plus, Pencil, X, Save } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { JobLineItem, MaterialStatus, MaterialPricing } from '@/lib/supabase/types'

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

const MATERIAL_UNITS: JobLineItem['unit'][] = ['sq ft', 'ea', 'ln ft', 'bag', 'box']
const LABOR_UNITS: JobLineItem['unit'][] = ['hr', 'ea', 'sq ft']

function nextStatus(current: MaterialStatus | undefined): MaterialStatus {
  const idx = statusOrder.indexOf(current ?? 'needed')
  return statusOrder[(idx + 1) % statusOrder.length]
}

function calcAmount(qty: number, price: number): number {
  return Number((qty * price).toFixed(2))
}

export default function JobLineItems({
  items,
  jobId,
  isOwner = false,
}: {
  items: JobLineItem[]
  jobId?: string
  isOwner?: boolean
}) {
  const [liveItems, setLiveItems] = useState<JobLineItem[]>(items ?? [])
  const [updating, setUpdating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [materialsCatalog, setMaterialsCatalog] = useState<MaterialPricing[]>([])

  useEffect(() => {
    setLiveItems(items ?? [])
  }, [items])

  useEffect(() => {
    if (!editing || materialsCatalog.length > 0) return
    fetch('/api/reference?table=materials_pricing')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setMaterialsCatalog(data as MaterialPricing[]))
      .catch(() => {})
  }, [editing, materialsCatalog.length])

  const materials = liveItems.filter((i) => i.category === 'materials')
  const labor = liveItems.filter((i) => i.category === 'labor')

  const materialsTotal = materials.reduce((sum, i) => sum + (i.amount ?? 0), 0)
  const laborTotal = labor.reduce((sum, i) => sum + (i.amount ?? 0), 0)
  const grandTotal = materialsTotal + laborTotal

  async function persist(next: JobLineItem[]) {
    if (!jobId) return
    const original = liveItems
    setLiveItems(next)
    setUpdating(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_items: next }),
      })
      if (!res.ok) throw new Error('Failed to save')
    } catch (err) {
      console.error(err)
      setLiveItems(original)
      toast('Failed to save line items', 'error')
    } finally {
      setUpdating(false)
    }
  }

  async function cycleStatus(index: number) {
    if (!jobId) return
    const target = liveItems[index]
    if (target.category !== 'materials') return
    const updated = liveItems.map((it, i) =>
      i === index ? { ...it, status: nextStatus(it.status) } : it
    )
    await persist(updated)
  }

  async function deleteRow(index: number) {
    await persist(liveItems.filter((_, i) => i !== index))
    toast('Line item removed')
  }

  async function updateRow(index: number, patch: Partial<JobLineItem>) {
    const updated = liveItems.map((it, i) => {
      if (i !== index) return it
      const merged = { ...it, ...patch } as JobLineItem
      merged.amount = calcAmount(merged.quantity, merged.unit_price)
      return merged
    })
    await persist(updated)
  }

  async function addRow(category: 'materials' | 'labor') {
    const defaults: JobLineItem = {
      category,
      description: '',
      quantity: 1,
      unit: category === 'materials' ? 'sq ft' : 'hr',
      unit_price: 0,
      amount: 0,
      ...(category === 'materials' ? { status: 'needed' as MaterialStatus } : {}),
    }
    await persist([...liveItems, defaults])
  }

  // When a description matches a material in the catalog, auto-fill price/unit
  function onDescriptionBlur(index: number, value: string) {
    const match = materialsCatalog.find((m) => m.item.toLowerCase() === value.trim().toLowerCase())
    if (!match) {
      updateRow(index, { description: value })
      return
    }
    updateRow(index, {
      description: match.item,
      unit_price: Number(match.price_to_customer) || 0,
    })
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

  const materialIndexMap = useMemo(() => {
    const map = new Map<JobLineItem, number>()
    liveItems.forEach((it, i) => map.set(it, i))
    return map
  }, [liveItems])

  const canEdit = isOwner && !!jobId

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Line Items</h3>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-200 hover:text-white bg-white/10 hover:bg-white/20 rounded-md px-2 py-1"
          >
            {editing ? (
              <>
                <X className="w-3.5 h-3.5" /> Done
              </>
            ) : (
              <>
                <Pencil className="w-3.5 h-3.5" /> Edit
              </>
            )}
          </button>
        )}
      </div>

      {liveItems.length === 0 && !editing ? (
        <div className="p-6 text-center text-gray-400 text-sm">
          No line items yet.{' '}
          {canEdit && (
            <button onClick={() => setEditing(true)} className="text-primary-600 hover:underline">
              Add the first one.
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Materials */}
          {(materials.length > 0 || editing) && (
            <div>
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Materials
                </span>
                <div className="flex items-center gap-2">
                  {jobId && !editing && materials.length > 0 && (
                    <div className="flex items-center gap-1 text-[11px] text-gray-500">
                      <span>{materialStatusCounts.needed} needed</span>
                      <span>·</span>
                      <span>{materialStatusCounts.ordered} ordered</span>
                      <span>·</span>
                      <span>{materialStatusCounts.on_site + materialStatusCounts.received} ready</span>
                    </div>
                  )}
                  <span className="text-xs font-medium text-gray-500">
                    {formatCurrency(materialsTotal)}
                  </span>
                </div>
              </div>

              <div className="divide-y divide-gray-100">
                {materials.map((item) => {
                  const i = materialIndexMap.get(item)!
                  const status = item.status ?? 'needed'
                  const meta = statusMeta[status]
                  const Icon = meta.icon

                  if (editing) {
                    return (
                      <LineItemEditRow
                        key={i}
                        item={item}
                        disabled={updating}
                        unitOptions={MATERIAL_UNITS}
                        catalogList="materials-catalog"
                        onPatch={(patch) => updateRow(i, patch)}
                        onDescriptionBlur={(v) => onDescriptionBlur(i, v)}
                        onDelete={() => deleteRow(i)}
                      />
                    )
                  }

                  return (
                    <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{item.description}</p>
                        <p className="text-xs text-gray-500">
                          {item.quantity} {item.unit} &times; {formatCurrency(item.unit_price)}/{item.unit}
                        </p>
                      </div>
                      {jobId && (
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
                      )}
                      <span className="text-sm font-medium text-gray-900 w-24 text-right shrink-0">
                        {formatCurrency(item.amount)}
                      </span>
                    </div>
                  )
                })}
              </div>

              {editing && (
                <div className="px-4 py-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => addRow('materials')}
                    disabled={updating}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" /> Add material
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Labor */}
          {(labor.length > 0 || editing) && (
            <div>
              <div className="px-4 py-2 bg-gray-50 border-b border-t border-gray-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Labor
                </span>
                <span className="text-xs font-medium text-gray-500">{formatCurrency(laborTotal)}</span>
              </div>

              <div className="divide-y divide-gray-100">
                {labor.map((item) => {
                  const i = materialIndexMap.get(item)!
                  if (editing) {
                    return (
                      <LineItemEditRow
                        key={i}
                        item={item}
                        disabled={updating}
                        unitOptions={LABOR_UNITS}
                        onPatch={(patch) => updateRow(i, patch)}
                        onDescriptionBlur={(v) => updateRow(i, { description: v })}
                        onDelete={() => deleteRow(i)}
                      />
                    )
                  }

                  return (
                    <div key={i} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.description}</p>
                        <p className="text-xs text-gray-500">
                          {item.quantity} {item.unit} &times; {formatCurrency(item.unit_price)}/{item.unit}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(item.amount)}</span>
                    </div>
                  )
                })}
              </div>

              {editing && (
                <div className="px-4 py-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => addRow('labor')}
                    disabled={updating}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" /> Add labor
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Total */}
          {liveItems.length > 0 && (
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
          )}
        </>
      )}

      {/* Catalog datalist for autocomplete */}
      {editing && materialsCatalog.length > 0 && (
        <datalist id="materials-catalog">
          {materialsCatalog.map((m) => (
            <option key={m.id} value={m.item}>
              {formatCurrency(Number(m.price_to_customer))}/{m.unit}
            </option>
          ))}
        </datalist>
      )}
    </div>
  )
}

function LineItemEditRow({
  item,
  disabled,
  unitOptions,
  catalogList,
  onPatch,
  onDescriptionBlur,
  onDelete,
}: {
  item: JobLineItem
  disabled: boolean
  unitOptions: JobLineItem['unit'][]
  catalogList?: string
  onPatch: (patch: Partial<JobLineItem>) => void
  onDescriptionBlur: (value: string) => void
  onDelete: () => void
}) {
  const [description, setDescription] = useState(item.description)
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [unitPrice, setUnitPrice] = useState(String(item.unit_price))

  useEffect(() => setDescription(item.description), [item.description])
  useEffect(() => setQuantity(String(item.quantity)), [item.quantity])
  useEffect(() => setUnitPrice(String(item.unit_price)), [item.unit_price])

  return (
    <div className="px-4 py-3 grid grid-cols-12 gap-2 items-center">
      <input
        type="text"
        list={catalogList}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => onDescriptionBlur(description)}
        placeholder="Description"
        disabled={disabled}
        className="col-span-5 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
      <input
        type="number"
        step="0.01"
        min="0"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        onBlur={() => onPatch({ quantity: Number(quantity) || 0 })}
        placeholder="Qty"
        disabled={disabled}
        className="col-span-2 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
      <select
        value={item.unit}
        onChange={(e) => onPatch({ unit: e.target.value as JobLineItem['unit'] })}
        disabled={disabled}
        className="col-span-2 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white"
      >
        {unitOptions.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
      <input
        type="number"
        step="0.01"
        min="0"
        value={unitPrice}
        onChange={(e) => setUnitPrice(e.target.value)}
        onBlur={() => onPatch({ unit_price: Number(unitPrice) || 0 })}
        placeholder="Price"
        disabled={disabled}
        className="col-span-2 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        className="col-span-1 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50 justify-self-end"
        title="Delete row"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}
