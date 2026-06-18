'use client'

// Editable materials procurement list. The server page rolls material line
// items up across upcoming deposit-received jobs by `${description}|${unit}`;
// this island makes each rolled-up material's status editable per job and
// writes the change back to that job's line_items JSONB via the same
// PATCH /api/jobs/{id} contract JobLineItems uses.
//
// Each row expands to show its source jobs (one material can span several
// jobs), each with its own status select, plus a "Set all" shortcut. Because
// the rollup aggregates across jobs, a single status flip must update the
// matching line item(s) in every source job — re-matched by the same rollup
// key the server used.

import { useState } from 'react'
import Link from 'next/link'
import { Package, ShoppingCart, Truck, CheckCircle2, ChevronDown } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { JobLineItem, MaterialStatus } from '@/lib/supabase/types'

const statusMeta: Record<MaterialStatus, { label: string; icon: typeof Package; className: string }> = {
  needed: { label: 'Needed', icon: Package, className: 'bg-gray-100 text-gray-700' },
  ordered: { label: 'Ordered', icon: ShoppingCart, className: 'bg-blue-100 text-blue-700' },
  received: { label: 'Received', icon: Truck, className: 'bg-yellow-100 text-yellow-700' },
  on_site: { label: 'On site', icon: CheckCircle2, className: 'bg-green-100 text-green-700' },
}
const STATUS_ORDER: MaterialStatus[] = ['needed', 'ordered', 'received', 'on_site']

export type MaterialJob = { id: string; title: string; quantity: number; status: MaterialStatus }
export type MaterialRow = {
  key: string
  description: string
  unit: string
  totalQty: number
  jobs: MaterialJob[]
}

function rollupKey(item: JobLineItem): string {
  return `${item.description.trim().toLowerCase()}|${item.unit}`
}

export default function MaterialsRows({
  rows: initialRows,
  lineItemsByJob: initialItems,
}: {
  rows: MaterialRow[]
  lineItemsByJob: Record<string, JobLineItem[]>
}) {
  const [rows, setRows] = useState<MaterialRow[]>(initialRows)
  const [items, setItems] = useState<Record<string, JobLineItem[]>>(initialItems)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busyKey, setBusyKey] = useState<string | null>(null)

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Counts per status for a row, derived from its jobs' current statuses.
  function counts(row: MaterialRow): Record<MaterialStatus, number> {
    const c: Record<MaterialStatus, number> = { needed: 0, ordered: 0, received: 0, on_site: 0 }
    for (const j of row.jobs) c[j.status]++
    return c
  }

  // Persist a status change for one (row material, job) pair: re-match the
  // material line(s) in that job and PATCH the full line_items array back.
  async function persistJob(rowKey: string, jobId: string, status: MaterialStatus): Promise<boolean> {
    const current = items[jobId] ?? []
    const updated = current.map((it) =>
      it.category === 'materials' && rollupKey(it) === rowKey ? { ...it, status } : it
    )
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line_items: updated }),
    })
    if (!res.ok) return false
    setItems((prev) => ({ ...prev, [jobId]: updated }))
    return true
  }

  async function setJobStatus(row: MaterialRow, jobId: string, status: MaterialStatus) {
    const prevRows = rows
    // Optimistic row update.
    setRows((rs) =>
      rs.map((r) =>
        r.key === row.key
          ? { ...r, jobs: r.jobs.map((j) => (j.id === jobId ? { ...j, status } : j)) }
          : r
      )
    )
    setBusyKey(row.key)
    const ok = await persistJob(row.key, jobId, status)
    setBusyKey(null)
    if (!ok) {
      setRows(prevRows)
      toast('Could not update status', 'error')
    }
  }

  async function setAll(row: MaterialRow, status: MaterialStatus) {
    const prevRows = rows
    setRows((rs) =>
      rs.map((r) =>
        r.key === row.key ? { ...r, jobs: r.jobs.map((j) => ({ ...j, status })) } : r
      )
    )
    setBusyKey(row.key)
    const results = await Promise.allSettled(
      Array.from(new Set(row.jobs.map((j) => j.id))).map((jobId) => persistJob(row.key, jobId, status))
    )
    setBusyKey(null)
    const failed = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value)).length
    if (failed > 0) {
      setRows(prevRows)
      toast(`Could not update ${failed} job${failed !== 1 ? 's' : ''}`, 'error')
    } else {
      toast(`Marked all ${statusMeta[status].label.toLowerCase()}`)
    }
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const c = counts(row)
        const isOpen = expanded.has(row.key)
        const busy = busyKey === row.key
        return (
          <div key={row.key} className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ${busy ? 'opacity-60' : ''}`}>
            <button
              onClick={() => toggle(row.key)}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{row.description}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {STATUS_ORDER.map((s) => {
                    if (c[s] === 0) return null
                    const meta = statusMeta[s]
                    const Icon = meta.icon
                    return (
                      <span key={s} className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${meta.className}`}>
                        <Icon className="w-2.5 h-2.5" />
                        {c[s]} {meta.label.toLowerCase()}
                      </span>
                    )
                  })}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-gray-900">{row.totalQty} {row.unit}</p>
                <p className="text-xs text-gray-400">{row.jobs.length} job{row.jobs.length !== 1 ? 's' : ''}</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 p-4 space-y-3">
                {/* Set-all shortcut */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500">Set all to:</span>
                  {STATUS_ORDER.map((s) => (
                    <button
                      key={s}
                      disabled={busy}
                      onClick={() => setAll(row, s)}
                      className={`min-h-[36px] text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200 hover:border-primary-300 disabled:opacity-50 ${statusMeta[s].className}`}
                    >
                      {statusMeta[s].label}
                    </button>
                  ))}
                </div>

                {/* Per-job status */}
                <div className="space-y-2">
                  {row.jobs.map((j, i) => (
                    <div key={`${j.id}-${i}`} className="flex items-center justify-between gap-3">
                      <Link
                        href={`/dashboard/jobs/${j.id}`}
                        className="text-sm text-primary-600 hover:underline truncate min-w-0"
                      >
                        {j.title} <span className="text-gray-400">({j.quantity} {row.unit})</span>
                      </Link>
                      <select
                        value={j.status}
                        disabled={busy}
                        onChange={(e) => setJobStatus(row, j.id, e.target.value as MaterialStatus)}
                        className="min-h-[40px] text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 shrink-0"
                      >
                        {STATUS_ORDER.map((s) => (
                          <option key={s} value={s}>{statusMeta[s].label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
