'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  MapPin,
  Camera,
  Play,
  CheckCircle2,
  Package,
  Clock,
  Phone,
  ClipboardList,
  AlertCircle,
  UserCheck,
} from 'lucide-react'
import { toast } from '@/components/Toast'
import FinalPaymentButton from '@/components/dashboard/FinalPaymentButton'
import type { Job, JobLineItem, JobStatus, MaterialStatus } from '@/lib/supabase/types'

const statusMetaFor: Record<MaterialStatus, { label: string; className: string }> = {
  needed: { label: 'Needed', className: 'bg-gray-100 text-gray-700' },
  ordered: { label: 'Ordered', className: 'bg-blue-100 text-blue-700' },
  received: { label: 'Received', className: 'bg-yellow-100 text-yellow-700' },
  on_site: { label: 'On site', className: 'bg-green-100 text-green-700' },
}

function nextActionFor(status: JobStatus): { next: JobStatus; label: string; icon: typeof Play } | null {
  if (status === 'scheduled' || status === 'waiting_for_materials') {
    return { next: 'in_progress', label: 'Start job', icon: Play }
  }
  if (status === 'in_progress') {
    return { next: 'completed', label: 'Mark complete', icon: CheckCircle2 }
  }
  return null
}

const MATERIAL_STATUSES: MaterialStatus[] = ['needed', 'ordered', 'received', 'on_site']

export default function InstallerJobCard({ job }: { job: Job }) {
  const router = useRouter()
  const [status, setStatus] = useState<JobStatus>(job.status)
  const [updating, setUpdating] = useState(false)
  const [lineItems, setLineItems] = useState<JobLineItem[]>(job.line_items ?? [])
  const [materialSaving, setMaterialSaving] = useState<number | null>(null)

  const action = nextActionFor(status)
  const materials = lineItems.filter(
    (i): i is JobLineItem => i.category === 'materials'
  )
  const needingCount = materials.filter((m) => (m.status ?? 'needed') === 'needed').length

  async function advanceStatus() {
    if (!action) return
    setUpdating(true)
    const previous = status
    setStatus(action.next)
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action.next }),
      })
      if (!res.ok) throw new Error('Failed')
      toast(`Job marked ${action.next.replace('_', ' ')}`)
      router.refresh()
    } catch {
      setStatus(previous)
      toast('Could not update status', 'error')
    } finally {
      setUpdating(false)
    }
  }

  async function updateMaterialStatus(materialIndex: number, next: MaterialStatus) {
    // Map back from the filtered materials array to the full line_items array
    let runningMaterialIdx = -1
    const nextItems = lineItems.map((item) => {
      if (item.category !== 'materials') return item
      runningMaterialIdx += 1
      if (runningMaterialIdx !== materialIndex) return item
      return { ...item, status: next }
    })

    const previous = lineItems
    setLineItems(nextItems)
    setMaterialSaving(materialIndex)

    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_items: nextItems }),
      })
      if (!res.ok) throw new Error('Failed')
      toast(`Marked ${next.replace('_', ' ')}`)
      router.refresh()
    } catch {
      setLineItems(previous)
      toast('Could not update material', 'error')
    } finally {
      setMaterialSaving(null)
    }
  }

  const addressQuery = job.client_address ? encodeURIComponent(job.client_address) : null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-5">
        {/* Title + status */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-gray-900">{job.title}</h3>
            <p className="text-sm text-gray-500">{job.client_name}</p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-700 capitalize whitespace-nowrap">
            {status.replace('_', ' ')}
          </span>
        </div>

        {/* Customer contact — tap-to-call + tap-to-map */}
        <div className="space-y-2 mb-4">
          {job.client_phone && (
            <a
              href={`tel:${job.client_phone.replace(/\D/g, '')}`}
              className="flex items-center gap-2 px-3 py-2 bg-primary-50 hover:bg-primary-100 rounded-lg text-primary-700 font-medium text-sm"
            >
              <Phone className="w-4 h-4 shrink-0" />
              {job.client_phone}
            </a>
          )}
          {job.client_address && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${addressQuery}`}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-700 font-medium text-sm"
            >
              <MapPin className="w-4 h-4 shrink-0" />
              <span className="truncate">{job.client_address}</span>
            </a>
          )}
        </div>

        {/* Primary action */}
        {action && (
          <button
            type="button"
            onClick={advanceStatus}
            disabled={updating}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-lg text-base font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 mb-4"
          >
            <action.icon className="w-5 h-5" />
            {updating ? 'Saving...' : action.label}
          </button>
        )}

        {/* Final payment — any crew can record when cash/check changes hands on site */}
        {(status === 'in_progress' || status === 'completed' || status === 'paid') && (
          <div className="mb-4 grid grid-cols-1">
            <FinalPaymentButton
              jobId={job.id}
              estimatedCost={job.estimated_cost}
              amountPaid={Number(job.amount_paid ?? 0)}
              alreadyReceived={Boolean(job.final_payment_at)}
              variant="compact"
            />
          </div>
        )}

        {/* Customer providing — critical so Christian doesn't duplicate-buy */}
        {job.customer_provides && (
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-900 uppercase tracking-wider mb-1">
              <UserCheck className="w-3.5 h-3.5" />
              Customer is providing
            </div>
            <p className="text-sm text-blue-900 whitespace-pre-wrap">{job.customer_provides}</p>
          </div>
        )}

        {/* Crew instructions — the field Vince writes for Christian */}
        {job.crew_instructions && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 uppercase tracking-wider mb-1">
              <AlertCircle className="w-3.5 h-3.5" />
              Instructions
            </div>
            <p className="text-sm text-amber-900 whitespace-pre-wrap">{job.crew_instructions}</p>
          </div>
        )}

        {/* Scope of work */}
        {job.scope_notes && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              <ClipboardList className="w-3.5 h-3.5" />
              Scope
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.scope_notes}</p>
          </div>
        )}

        {/* Full materials list */}
        {materials.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <Package className="w-3.5 h-3.5" />
                Materials ({materials.length})
              </div>
              {needingCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                  {needingCount} not ready
                </span>
              )}
            </div>
            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
              {materials.map((m, i) => {
                const currentStatus = m.status ?? 'needed'
                const meta = statusMetaFor[currentStatus]
                const saving = materialSaving === i
                return (
                  <li
                    key={i}
                    className="px-3 py-2 flex items-center justify-between gap-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-gray-900 truncate">{m.description}</p>
                      <p className="text-xs text-gray-500">
                        {m.quantity} {m.unit}
                      </p>
                    </div>
                    <select
                      value={currentStatus}
                      onChange={(e) => updateMaterialStatus(i, e.target.value as MaterialStatus)}
                      disabled={saving}
                      className={`text-[11px] font-medium px-2 py-1 rounded-full border-0 focus:ring-2 focus:ring-primary-500 shrink-0 cursor-pointer disabled:opacity-60 ${meta.className}`}
                      aria-label={`Update status for ${m.description}`}
                    >
                      {MATERIAL_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {statusMetaFor[s].label}
                        </option>
                      ))}
                    </select>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
          <Link
            href={`/dashboard/jobs/${job.id}`}
            className="flex-1 text-center text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md py-2"
          >
            Full details
          </Link>
          <Link
            href={`/dashboard/jobs/${job.id}#photos`}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
          >
            <Camera className="w-4 h-4" />
            Photo
          </Link>
        </div>

        {/* Schedule line (when not in active state) */}
        {job.scheduled_start && !action && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-3">
            <Clock className="w-3 h-3" />
            Scheduled {new Date(job.scheduled_start + 'T00:00:00').toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  )
}
