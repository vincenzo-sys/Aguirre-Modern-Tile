'use client'

import { useEffect, useMemo, useState } from 'react'
import { Package, ShoppingCart, Truck, CheckCircle2, Trash2, Plus, Pencil, X, ExternalLink, Wand2, AlertTriangle } from 'lucide-react'
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

const MATERIAL_UNITS: JobLineItem['unit'][] = ['sheet', 'bag', 'tube', 'kit', 'roll', 'box', 'sq ft', 'ln ft', 'ea']
// Labor defaults to 'day' (2-man crew day rate). Use 'hr' for hourly carve-outs.
const LABOR_UNITS: JobLineItem['unit'][] = ['day', 'hr', 'ea', 'sq ft']

const PROJECTWIDE_LABEL = 'Project-wide'

// Aguirre target margin band (see feedback_pricing_conventions): aim for
// 39–45%. Below 39% the footer flags the job; the "Set margin → 40%" quick
// adjuster snaps it back into the band.
const TARGET_MARGIN_MIN = 39
const TARGET_MARGIN_MAX = 45

function calcAmount(qty: number, price: number): number {
  return Number((qty * price).toFixed(2))
}

// Per-line wholesale cost — mirrors the engine's costTotal logic. Returns
// null when the catalog/rate data isn't available yet OR the line is a
// pass-through (trash/transport) that shouldn't display a separate cost
// vs customer price (cost = customer for those, 0% margin by design).
function lineCost(
  item: JobLineItem,
  catalog: MaterialPricing[],
  dayCost: number | null
): number | null {
  if (item.category === 'materials') {
    const row = catalog.find((r) => r.item === item.description)
    if (!row) return null
    return Number((Number(row.your_cost) * item.quantity).toFixed(2))
  }
  if (item.category === 'labor' && item.unit === 'day' && dayCost != null) {
    return Number((dayCost * item.quantity).toFixed(2))
  }
  return null  // pass-through — no separate cost number
}

// Group items by section in the order each section first appears, then float
// the implicit "Project-wide" bucket (unsectioned items: trash, transport,
// hand-added rows) to the end. Single-section jobs land entirely in
// Project-wide and we suppress the header to keep the legacy look.
function groupBySection(items: JobLineItem[]): Array<[string, JobLineItem[]]> {
  const sectionMap = new Map<string, JobLineItem[]>()
  for (const item of items) {
    const key = item.section || PROJECTWIDE_LABEL
    if (!sectionMap.has(key)) sectionMap.set(key, [])
    sectionMap.get(key)!.push(item)
  }
  return [
    ...Array.from(sectionMap.entries()).filter(([k]) => k !== PROJECTWIDE_LABEL),
    ...(sectionMap.has(PROJECTWIDE_LABEL)
      ? [[PROJECTWIDE_LABEL, sectionMap.get(PROJECTWIDE_LABEL)!] as [string, JobLineItem[]]]
      : []),
  ]
}

export default function JobLineItems({
  items,
  jobId,
  isOwner = false,
  marginPercent = null,
}: {
  items: JobLineItem[]
  jobId?: string
  isOwner?: boolean
  // Last-generated profit margin (jobs.margin_percent). Shown in the footer
  // next to the total. Hand edits to line items don't update this until the
  // next regenerate — we surface a "stale" hint when items have been
  // edited locally so the user knows the number is approximate.
  marginPercent?: number | null
}) {
  const [liveItems, setLiveItems] = useState<JobLineItem[]>(items ?? [])
  const [updating, setUpdating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [materialsCatalog, setMaterialsCatalog] = useState<MaterialPricing[]>([])
  const [laborRates, setLaborRates] = useState<Array<{ setting: string; value: number }>>([])

  useEffect(() => {
    setLiveItems(items ?? [])
  }, [items])

  // Fetch reference data on mount so the footer can show live cost + profit
  // (in addition to the persisted margin). The same catalog also drives the
  // editor's autocomplete; fetching here means we don't need a second fetch
  // when the user clicks Edit.
  useEffect(() => {
    if (!isOwner || !jobId) return
    if (materialsCatalog.length === 0) {
      fetch('/api/reference?table=materials_pricing')
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setMaterialsCatalog(data as MaterialPricing[]))
        .catch(() => {})
    }
    if (laborRates.length === 0) {
      fetch('/api/reference?table=labor_rates')
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setLaborRates((data as Array<{ setting: string; value: number }>) ?? []))
        .catch(() => {})
    }
  }, [isOwner, jobId, materialsCatalog.length, laborRates.length])

  // Index by reference so we can edit/delete the right row regardless of
  // section grouping. Sections are presentation only — the underlying array
  // index is what we PATCH.
  const itemIndexMap = useMemo(() => {
    const map = new Map<JobLineItem, number>()
    liveItems.forEach((it, i) => map.set(it, i))
    return map
  }, [liveItems])

  const sections = useMemo(() => groupBySection(liveItems), [liveItems])
  const showSectionHeaders =
    sections.length > 1 || (sections[0] && sections[0][0] !== PROJECTWIDE_LABEL)

  const grandTotal = liveItems.reduce((s, i) => s + (i.amount ?? 0), 0)

  // Live cost / profit / margin — mirrors the engine's costTotal in
  // src/lib/estimator/scopes.ts. Materials use catalog.your_cost × qty;
  // day-unit labor uses day_rate × crew_size × qty; non-day labor (trash,
  // transport, ea) is treated as pass-through (cost = revenue, 0% margin).
  // When catalog/rates haven't loaded yet, costStats stays null and the
  // footer falls back to the persisted marginPercent prop.
  // dayCostNumber is also used by SectionBlock to render per-line costs
  // independent of whether the costStats summary is computed.
  const dayCostNumber = useMemo(() => {
    if (laborRates.length === 0) return null
    const dayRate =
      Number(laborRates.find((r) => r.setting === 'Day Rate (per tiler)')?.value) || 250
    const crewSize =
      Number(laborRates.find((r) => r.setting === 'Standard Crew Size')?.value) || 2
    return dayRate * crewSize
  }, [laborRates])

  const costStats = useMemo(() => {
    if (materialsCatalog.length === 0 || dayCostNumber == null) return null
    const dayCost = dayCostNumber
    const cost = liveItems.reduce((sum, item) => {
      if (item.category === 'materials') {
        const row = materialsCatalog.find((r) => r.item === item.description)
        if (row) return sum + Number(row.your_cost) * item.quantity
        return sum + item.amount  // unknown material → assume 0% margin
      }
      if (item.category === 'labor' && item.unit === 'day') {
        return sum + dayCost * item.quantity
      }
      return sum + item.amount  // pass-through (trash, transport, ea)
    }, 0)
    const profit = grandTotal - cost
    const margin = grandTotal > 0 ? (profit / grandTotal) * 100 : 0
    return { cost, profit, margin }
  }, [liveItems, materialsCatalog, dayCostNumber, grandTotal])

  // Live margin overrides the persisted prop once we have the data to
  // compute it; the persisted value is stale the moment a line item is
  // hand-edited, so the live number is always more accurate when shown.
  const displayMargin = costStats ? costStats.margin : marginPercent

  const allMaterials = liveItems.filter((i) => i.category === 'materials')
  const materialStatusCounts: Record<MaterialStatus, number> = {
    needed: 0,
    ordered: 0,
    received: 0,
    on_site: 0,
  }
  for (const m of allMaterials) materialStatusCounts[m.status ?? 'needed']++

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

  async function setStatus(index: number, newStatus: MaterialStatus) {
    if (!jobId) return
    const target = liveItems[index]
    if (target.category !== 'materials') return
    if ((target.status ?? 'needed') === newStatus) return
    const updated = liveItems.map((it, i) =>
      i === index ? { ...it, status: newStatus } : it
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

  // ── Quick price adjusters ──────────────────────────────────────────────
  // Reshape the whole job's customer prices in one tap. Cost is never touched
  // (catalog your_cost / day rate stay fixed) — only the customer-facing
  // amounts move, so margin recomputes live from the same costStats.

  // Scale the priced lines (materials w/ catalog match + day-unit labor) so the
  // job hits the target margin. Pass-through lines (trash/transport/ea) hold —
  // they're 0-margin by design and shouldn't absorb markup. Needs cost data.
  async function applyTargetMargin(target: number) {
    if (!costStats || dayCostNumber == null) {
      toast('Pricing data still loading — try again in a moment', 'error')
      return
    }
    const cost = costStats.cost
    if (cost <= 0) {
      toast('No cost basis on these line items', 'error')
      return
    }
    const targetRevenue = cost / (1 - target)
    const priced = liveItems
      .map((it) => ({ it, c: lineCost(it, materialsCatalog, dayCostNumber) }))
      .filter((x) => x.c != null)
    const pricedRevenue = priced.reduce((s, x) => s + (x.it.amount ?? 0), 0)
    const passThroughRevenue = grandTotal - pricedRevenue
    const newPricedRevenue = targetRevenue - passThroughRevenue
    if (pricedRevenue <= 0 || newPricedRevenue <= 0) {
      toast('Can’t reach that margin by scaling the priced lines', 'error')
      return
    }
    const factor = newPricedRevenue / pricedRevenue
    const next = liveItems.map((it) => {
      if (lineCost(it, materialsCatalog, dayCostNumber) == null) return it
      const newUnitPrice = it.quantity
        ? Number(((it.amount * factor) / it.quantity).toFixed(2))
        : Number((it.amount * factor).toFixed(2))
      return { ...it, unit_price: newUnitPrice, amount: calcAmount(it.quantity, newUnitPrice) }
    })
    await persist(next)
    toast(`Margin set to ~${Math.round(target * 100)}%`)
  }

  // Nudge the grand total to a round number by adjusting the single largest
  // line — keeps every other line untouched so the change is legible.
  async function roundTotalTo(step: number) {
    if (liveItems.length === 0) return
    const rounded = Math.round(grandTotal / step) * step
    const delta = rounded - grandTotal
    if (Math.abs(delta) < 0.005) {
      toast(`Total is already a round $${step}`)
      return
    }
    let maxIdx = 0
    liveItems.forEach((it, i) => {
      if ((it.amount ?? 0) > (liveItems[maxIdx].amount ?? 0)) maxIdx = i
    })
    const target = liveItems[maxIdx]
    const newAmount = Number(((target.amount ?? 0) + delta).toFixed(2))
    if (newAmount <= 0) {
      toast('Rounding would zero out the largest line', 'error')
      return
    }
    const newUnitPrice = target.quantity
      ? Number((newAmount / target.quantity).toFixed(2))
      : newAmount
    const next = liveItems.map((it, i) =>
      i === maxIdx
        ? { ...it, unit_price: newUnitPrice, amount: calcAmount(target.quantity, newUnitPrice) }
        : it
    )
    await persist(next)
    toast(`Total rounded to ${formatCurrency(rounded)}`)
  }

  async function addRow(category: 'materials' | 'labor') {
    const defaults: JobLineItem = {
      category,
      description: '',
      quantity: 1,
      // Labor: default to a 2-man crew day at $1,000/day (100% markup on
      // $500/day cost). Edit inline for 1-man days ($500) or hourly work.
      // Materials: default to 'sheet' since backer boards are the most common.
      unit: category === 'materials' ? 'sheet' : 'day',
      unit_price: category === 'labor' ? 1000 : 0,
      amount: category === 'labor' ? 1000 : 0,
      ...(category === 'materials' ? { status: 'needed' as MaterialStatus } : {}),
    }
    await persist([...liveItems, defaults])
  }

  function onDescriptionBlur(index: number, value: string) {
    const match = materialsCatalog.find((m) => m.item.toLowerCase() === value.trim().toLowerCase())
    if (!match) {
      updateRow(index, { description: value })
      return
    }
    const updates: Partial<JobLineItem> = {
      description: match.item,
      unit_price: Number(match.price_to_customer) || 0,
    }
    if (match.retail_link) {
      updates.source_url = match.retail_link
      try {
        const host = new URL(match.retail_link).hostname.replace(/^www\./, '')
        updates.source_name = `${match.item} at ${host}`
      } catch {
        updates.source_name = match.item
      }
    }
    updateRow(index, updates)
  }

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
                <Pencil className="w-3.5 h-3.5" /> Edit / add items
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
          {sections.map(([sectionKey, sectionItems]) => (
            <SectionBlock
              key={sectionKey}
              sectionKey={sectionKey}
              items={sectionItems}
              showHeader={showSectionHeaders}
              editing={editing}
              jobId={jobId}
              updating={updating}
              itemIndexMap={itemIndexMap}
              materialsCatalog={materialsCatalog}
              dayCost={dayCostNumber}
              onSetStatus={setStatus}
              onUpdateRow={updateRow}
              onDeleteRow={deleteRow}
              onDescriptionBlur={onDescriptionBlur}
            />
          ))}

          {editing && (
            <>
              <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-3 bg-gray-50">
                <button
                  type="button"
                  onClick={() => addRow('materials')}
                  disabled={updating}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" /> Add material
                </button>
                <button
                  type="button"
                  onClick={() => addRow('labor')}
                  disabled={updating}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" /> Add labor
                </button>
                <span className="text-xs text-gray-400 ml-auto">New rows land in Project-wide</span>
              </div>

              {/* Quick price adjusters — reshape customer prices in one tap.
                  Cost stays fixed; margin recomputes live. */}
              <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap items-center gap-2 bg-gray-50">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 mr-1">
                  <Wand2 className="w-3.5 h-3.5" /> Quick adjust
                </span>
                <button
                  type="button"
                  onClick={() => applyTargetMargin(0.4)}
                  disabled={updating || !costStats}
                  title={costStats ? 'Scale priced lines to a 40% margin' : 'Loading cost data…'}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40"
                >
                  Set margin → 40%
                </button>
                <button
                  type="button"
                  onClick={() => roundTotalTo(100)}
                  disabled={updating}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200 text-gray-700 bg-white hover:bg-gray-100 disabled:opacity-40"
                >
                  Round total → $100
                </button>
                <button
                  type="button"
                  onClick={() => roundTotalTo(250)}
                  disabled={updating}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200 text-gray-700 bg-white hover:bg-gray-100 disabled:opacity-40"
                >
                  Round total → $250
                </button>
              </div>
            </>
          )}

          {/* Grand total */}
          {liveItems.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between gap-4">
                {jobId && allMaterials.length > 0 && !editing && (
                  <div className="text-[11px] text-gray-500">
                    {materialStatusCounts.needed} needed · {materialStatusCounts.ordered} ordered ·{' '}
                    {materialStatusCounts.on_site + materialStatusCounts.received} ready
                  </div>
                )}
                <div className="ml-auto flex items-end gap-6">
                  {costStats && (
                    <>
                      <div className="text-right">
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Cost</span>
                        <p className="text-sm font-medium text-gray-700">
                          {formatCurrency(costStats.cost)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Profit</span>
                        <p className="text-sm font-semibold text-emerald-700">
                          {formatCurrency(costStats.profit)}
                        </p>
                      </div>
                    </>
                  )}
                  {displayMargin != null && (
                    <div className="text-right">
                      <span className="text-xs text-gray-500 uppercase tracking-wider">Margin</span>
                      <p
                        className={`text-xl font-bold ${
                          displayMargin >= TARGET_MARGIN_MIN
                            ? 'text-emerald-700'
                            : displayMargin >= 30
                              ? 'text-amber-600'
                              : 'text-red-600'
                        }`}
                      >
                        {Number(displayMargin).toFixed(1)}%
                      </p>
                      <span className="text-[10px] text-gray-400">
                        Target {TARGET_MARGIN_MIN}–{TARGET_MARGIN_MAX}%
                      </span>
                    </div>
                  )}
                  <div className="text-right">
                    <span className="text-xs text-gray-500 uppercase tracking-wider">Total</span>
                    <p className="text-xl font-bold text-gray-900">{formatCurrency(grandTotal)}</p>
                  </div>
                </div>
              </div>

              {/* Below-target flag — only when we have real cost data to judge
                  against. Nudges the owner to the "Set margin → 40%" adjuster. */}
              {costStats && displayMargin != null && displayMargin < TARGET_MARGIN_MIN && (
                <div className="mt-2 flex items-center gap-2 text-xs text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    Margin is below the {TARGET_MARGIN_MIN}% target.
                    {canEdit && !editing && ' Tap “Edit / add items” to use the quick adjusters.'}
                  </span>
                </div>
              )}
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

// One per scope (or one for the whole job in single-scope mode). Internally
// shows materials and labor as sub-bands matching the legacy layout, so a
// single-scope job looks identical to before.
function SectionBlock({
  sectionKey,
  items,
  showHeader,
  editing,
  jobId,
  updating,
  itemIndexMap,
  materialsCatalog,
  dayCost,
  onSetStatus,
  onUpdateRow,
  onDeleteRow,
  onDescriptionBlur,
}: {
  sectionKey: string
  items: JobLineItem[]
  showHeader: boolean
  editing: boolean
  jobId?: string
  updating: boolean
  itemIndexMap: Map<JobLineItem, number>
  materialsCatalog: MaterialPricing[]
  dayCost: number | null
  onSetStatus: (index: number, status: MaterialStatus) => void
  onUpdateRow: (index: number, patch: Partial<JobLineItem>) => void
  onDeleteRow: (index: number) => void
  onDescriptionBlur: (index: number, value: string) => void
}) {
  const materials = items.filter((i) => i.category === 'materials')
  const labor = items.filter((i) => i.category === 'labor')
  const sectionTotal = items.reduce((s, i) => s + (i.amount ?? 0), 0)

  return (
    <div>
      {showHeader && (
        <div className="px-4 py-2 bg-primary-50 border-b border-primary-100 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-primary-900">{sectionKey}</h4>
          <span className="text-xs font-medium text-primary-800">{formatCurrency(sectionTotal)}</span>
        </div>
      )}

      {(materials.length > 0 || (editing && !showHeader)) && (
        <div>
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Materials</span>
            <span className="text-xs font-medium text-gray-500">
              {formatCurrency(materials.reduce((s, i) => s + (i.amount ?? 0), 0))}
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {materials.map((item) => {
              const i = itemIndexMap.get(item)!
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
                    onPatch={(patch) => onUpdateRow(i, patch)}
                    onDescriptionBlur={(v) => onDescriptionBlur(i, v)}
                    onDelete={() => onDeleteRow(i)}
                  />
                )
              }
              return (
                <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                      <span>{item.description}</span>
                      {item.source_url && (
                        <a
                          href={item.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={item.source_name || 'Source'}
                          className="text-gray-400 hover:text-primary-600"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.quantity} {item.unit} &times; {formatCurrency(item.unit_price)}/{item.unit}
                    </p>
                  </div>
                  {jobId && (
                    <div className="shrink-0 flex items-center gap-1">
                      <Icon className="w-3 h-3 text-gray-500" />
                      <select
                        value={status}
                        onChange={(e) => onSetStatus(i, e.target.value as MaterialStatus)}
                        disabled={updating}
                        className={`text-xs font-medium px-2 py-1 rounded-full border-0 focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer ${meta.className} disabled:opacity-50`}
                      >
                        {statusOrder.map((s) => (
                          <option key={s} value={s}>
                            {statusMeta[s].label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <CostCustomerCell
                    cost={lineCost(item, materialsCatalog, dayCost)}
                    customer={item.amount}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {(labor.length > 0 || (editing && !showHeader)) && (
        <div>
          <div className="px-4 py-2 bg-gray-50 border-b border-t border-gray-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Labor</span>
            <span className="text-xs font-medium text-gray-500">
              {formatCurrency(labor.reduce((s, i) => s + (i.amount ?? 0), 0))}
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {labor.map((item) => {
              const i = itemIndexMap.get(item)!
              if (editing) {
                return (
                  <LineItemEditRow
                    key={i}
                    item={item}
                    disabled={updating}
                    unitOptions={LABOR_UNITS}
                    onPatch={(patch) => onUpdateRow(i, patch)}
                    onDescriptionBlur={(v) => onUpdateRow(i, { description: v })}
                    onDelete={() => onDeleteRow(i)}
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
                  <CostCustomerCell
                    cost={lineCost(item, materialsCatalog, dayCost)}
                    customer={item.amount}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Side-by-side display of "Our cost" vs "Customer" for a single line. When
// cost is null (pass-through items like trash/transport/ea-unit labor, or
// materials that haven't loaded their catalog yet) we hide the cost column
// so the customer price stays visually anchored to the right.
function CostCustomerCell({ cost, customer }: { cost: number | null; customer: number }) {
  return (
    <div className="shrink-0 flex items-stretch gap-3 text-right">
      {cost != null && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400">Our cost</div>
          <div className="text-sm font-medium text-gray-500">{formatCurrency(cost)}</div>
        </div>
      )}
      <div className="w-24">
        <div className="text-[10px] uppercase tracking-wider text-gray-500">Customer</div>
        <div className="text-sm font-semibold text-gray-900">{formatCurrency(customer)}</div>
      </div>
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
  const [sourceUrl, setSourceUrl] = useState(item.source_url ?? '')
  const [sourceName, setSourceName] = useState(item.source_name ?? '')
  const [showSource, setShowSource] = useState(Boolean(item.source_url))

  useEffect(() => setDescription(item.description), [item.description])
  useEffect(() => setQuantity(String(item.quantity)), [item.quantity])
  useEffect(() => setUnitPrice(String(item.unit_price)), [item.unit_price])
  useEffect(() => setSourceUrl(item.source_url ?? ''), [item.source_url])
  useEffect(() => setSourceName(item.source_name ?? ''), [item.source_name])

  return (
    <div className="px-4 py-3">
      <div className="grid grid-cols-12 gap-2 items-center">
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
      {item.category === 'materials' && (
        <div className="mt-1.5">
          {showSource ? (
            <div className="grid grid-cols-12 gap-2 items-center">
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                onBlur={() => onPatch({ source_url: sourceUrl.trim() || null })}
                placeholder="Source URL (internal — not shown to customer)"
                disabled={disabled}
                className="col-span-7 px-2 py-1 border border-gray-200 rounded text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <input
                type="text"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                onBlur={() => onPatch({ source_name: sourceName.trim() || null })}
                placeholder="Source label"
                disabled={disabled}
                className="col-span-4 px-2 py-1 border border-gray-200 rounded text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <button
                type="button"
                onClick={() => {
                  setSourceUrl('')
                  setSourceName('')
                  setShowSource(false)
                  onPatch({ source_url: null, source_name: null })
                }}
                disabled={disabled}
                className="col-span-1 p-1 text-gray-400 hover:text-red-600 rounded disabled:opacity-50 justify-self-end"
                title="Remove source"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSource(true)}
              disabled={disabled}
              className="text-[11px] text-gray-400 hover:text-primary-600 inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" /> add source link
            </button>
          )}
        </div>
      )}
    </div>
  )
}
