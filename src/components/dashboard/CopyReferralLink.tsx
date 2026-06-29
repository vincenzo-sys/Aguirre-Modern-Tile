'use client'

import { useState } from 'react'
import { Copy, Check, Gift } from 'lucide-react'
import { toast } from '@/components/Toast'

// Owner-facing: copy a customer's referral link so Vince can text it.
// Builds the URL from the current origin so it works in any environment.
export default function CopyReferralLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const url = typeof window !== 'undefined' ? `${window.location.origin}/refer/${code}` : `/refer/${code}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Could not copy link', 'error')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 min-w-0 truncate text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-2 py-1.5">
        /refer/{code}
      </code>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 whitespace-nowrap"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Gift className="w-3.5 h-3.5" />}
        {copied ? 'Copied' : 'Copy referral link'}
      </button>
    </div>
  )
}
