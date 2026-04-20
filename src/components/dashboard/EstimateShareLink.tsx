'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Link as LinkIcon, Copy, CheckCircle2, Eye, MousePointerClick, Loader2, ExternalLink } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { Job } from '@/lib/supabase/types'

function siteBase(): string {
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

function daysAgo(iso: string | null): string | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

export default function EstimateShareLink({ job }: { job: Job }) {
  const router = useRouter()
  const [generating, setGenerating] = useState(false)
  const [token, setToken] = useState<string | null>(job.estimate_token)
  const [copied, setCopied] = useState(false)

  const url = token ? `${siteBase()}/estimates/${token}` : null

  async function generateOrRefresh() {
    setGenerating(true)
    try {
      const res = await fetch(`/api/jobs/${job.id}/estimate-link`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setToken(data.token)
      toast(job.estimate_token ? 'Link refreshed' : 'Estimate link ready')
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

  const viewedAgo = daysAgo(job.estimate_viewed_at)
  const acceptedAgo = daysAgo(job.estimate_accepted_at)

  if (!token) {
    return (
      <button
        type="button"
        onClick={generateOrRefresh}
        disabled={generating}
        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium disabled:opacity-50"
      >
        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
        Create estimate link
      </button>
    )
  }

  return (
    <div className="w-full bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <LinkIcon className="w-4 h-4 text-gray-500" />
          Estimate link
        </h3>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {acceptedAgo ? (
            <span className="inline-flex items-center gap-1 text-green-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Accepted {acceptedAgo}
            </span>
          ) : viewedAgo ? (
            <span className="inline-flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" />
              Viewed {viewedAgo}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <MousePointerClick className="w-3.5 h-3.5" />
              Not opened yet
            </span>
          )}
        </div>
      </div>

      <div className="flex items-stretch gap-2">
        <code className="flex-1 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-md text-gray-700 truncate">
          {url}
        </code>
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
      </div>

      <p className="text-xs text-gray-500 mt-2">
        Customer sees the estimate, accepts, and pays the 10% deposit via Stripe. Webhook auto-records the payment.
      </p>
    </div>
  )
}
