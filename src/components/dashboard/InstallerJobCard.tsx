'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MapPin, Camera, Play, CheckCircle2, Package, Clock } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { Job, JobLineItem, JobStatus, MaterialStatus } from '@/lib/supabase/types'

const statusMetaFor: Record<MaterialStatus, string> = {
  needed: 'Needed',
  ordered: 'Ordered',
  received: 'Received',
  on_site: 'On site',
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

export default function InstallerJobCard({ job }: { job: Job }) {
  const router = useRouter()
  const [status, setStatus] = useState<JobStatus>(job.status)
  const [updating, setUpdating] = useState(false)

  const action = nextActionFor(status)
  const materials = (job.line_items ?? []).filter(
    (i): i is JobLineItem => i.category === 'materials'
  )
  const topMaterials = materials.slice(0, 3)
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

  const addressQuery = job.client_address ? encodeURIComponent(job.client_address) : null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-gray-900 truncate">{job.title}</h3>
            <p className="text-sm text-gray-500 truncate">{job.client_name}</p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-700 capitalize whitespace-nowrap">
            {status.replace('_', ' ')}
          </span>
        </div>

        {job.client_address && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${addressQuery}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:underline mb-4"
          >
            <MapPin className="w-4 h-4" />
            {job.client_address}
          </a>
        )}

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

        {topMaterials.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Materials
              </span>
              {needingCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                  <Package className="w-3 h-3" />
                  {needingCount} still needed
                </span>
              )}
            </div>
            <ul className="space-y-1">
              {topMaterials.map((m, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate">{m.description}</span>
                  <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">
                    {statusMetaFor[m.status ?? 'needed']}
                  </span>
                </li>
              ))}
              {materials.length > 3 && (
                <li className="text-xs text-gray-400">+{materials.length - 3} more</li>
              )}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
          <Link
            href={`/dashboard/jobs/${job.id}`}
            className="flex-1 text-center text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md py-2"
          >
            View details
          </Link>
          <Link
            href={`/dashboard/jobs/${job.id}#photos`}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
          >
            <Camera className="w-4 h-4" />
            Photo
          </Link>
        </div>

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
