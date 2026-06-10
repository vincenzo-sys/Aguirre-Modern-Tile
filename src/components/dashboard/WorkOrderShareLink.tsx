'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { HardHat, Copy, CheckCircle2, Loader2, ExternalLink, Share2 } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { Job } from '@/lib/supabase/types'

function siteBase(): string {
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

export default function WorkOrderShareLink({ job }: { job: Job }) {
  const router = useRouter()
  const [generating, setGenerating] = useState(false)
  const [token, setToken] = useState<string | null>(job.work_order_token ?? null)
  const [copied, setCopied] = useState(false)

  const url = token ? `${siteBase()}/work-orders/${token}` : null

  async function generate() {
    setGenerating(true)
    try {
      const res = await fetch(`/api/jobs/${job.id}/work-order-link`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setToken(data.token)
      toast(token ? 'Link refreshed' : 'Work order link ready')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error')
    } finally {
      setGenerating(false)
    }
  }

  async function copy() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    toast('Link copied')
    setTimeout(() => setCopied(false), 1500)
  }

  // Native share sheet on phones — lets Vince fire it straight into a text
  // to the crew. Falls back to copy where the Web Share API isn't available.
  async function share() {
    if (!url) return
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Work order — ${job.title}`,
          text: `Job details for ${job.client_name}:`,
          url,
        })
        return
      } catch {
        // user cancelled the share sheet — no-op
        return
      }
    }
    copy()
  }

  if (!token) {
    return (
      <div className="w-full bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <HardHat className="w-4 h-4 text-gray-500" />
            Crew work order link
          </h3>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          A public link for the install crew — customer, address, scope, and materials.
          No pricing. Safe to text to anyone.
        </p>
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium disabled:opacity-50"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardHat className="w-4 h-4" />}
          Create crew link
        </button>
      </div>
    )
  }

  return (
    <div className="w-full bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <HardHat className="w-4 h-4 text-gray-500" />
          Crew work order link
        </h3>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Customer, address, scope, and materials — no pricing. Safe to text the crew.
      </p>

      <div className="flex items-stretch gap-2">
        <code className="flex-1 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-md text-gray-700 truncate">
          {url}
        </code>
        <button
          type="button"
          onClick={share}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary-600 text-white hover:bg-primary-700 rounded-md text-sm font-medium"
        >
          <Share2 className="w-4 h-4" />
          Send
        </button>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium text-gray-700"
        >
          {copied ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium text-gray-700"
          >
            <ExternalLink className="w-4 h-4" />
            Preview
          </a>
        )}
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="ml-auto text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
        >
          {generating ? 'Refreshing…' : 'Refresh link'}
        </button>
      </div>
    </div>
  )
}
