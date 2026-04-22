'use client'

import { useState } from 'react'
import { Clipboard, Check, Loader2 } from 'lucide-react'
import { toast } from '@/components/Toast'

// Pulls a Claude-Desktop-ready markdown block from /api/context and
// copies it to the clipboard. Works on both lead and job pages — pass
// either leadId or jobId.

export default function CopyContextButton({
  leadId,
  jobId,
  size = 'md',
}: {
  leadId?: string
  jobId?: string
  size?: 'sm' | 'md'
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'copied'>('idle')

  async function handleCopy() {
    setStatus('loading')
    try {
      const qs = leadId ? `lead_id=${leadId}` : `job_id=${jobId}`
      const res = await fetch(`/api/context?${qs}`)
      if (!res.ok) throw new Error((await res.text()) || 'Failed to fetch context')
      const text = await res.text()
      await navigator.clipboard.writeText(text)
      setStatus('copied')
      toast('Context copied — paste into Claude Desktop', 'success')
      setTimeout(() => setStatus('idle'), 2500)
    } catch (err) {
      setStatus('idle')
      toast(err instanceof Error ? err.message : 'Copy failed', 'error')
    }
  }

  const sizing =
    size === 'sm'
      ? 'px-2.5 py-1.5 text-xs'
      : 'px-3 py-2 text-sm'

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={status === 'loading'}
      className={`inline-flex items-center gap-1.5 ${sizing} font-medium rounded-md border transition-colors disabled:opacity-50 ${
        status === 'copied'
          ? 'bg-green-50 border-green-200 text-green-800'
          : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
      }`}
      title="Copy lead/job context to clipboard for Claude Desktop"
    >
      {status === 'loading' && <Loader2 className={`${iconSize} animate-spin`} />}
      {status === 'copied' && <Check className={iconSize} />}
      {status === 'idle' && <Clipboard className={iconSize} />}
      {status === 'copied' ? 'Copied' : 'Copy for Claude'}
    </button>
  )
}
