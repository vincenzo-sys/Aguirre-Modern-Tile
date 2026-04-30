'use client'

import { useState } from 'react'
import { Share2, Check } from 'lucide-react'

// Share button with progressive enhancement: native share sheet on iOS/
// Android (Web Share API), SMS prefill on phones that lack it, mailto on
// desktop. The aim is to surface the estimate to the customer's spouse /
// decision-partner with one tap, since that's the #1 stall point on
// home-improvement decisions.

interface Props {
  url: string
  customerName: string
  total: string
}

export default function ShareEstimateButton({ url, customerName, total }: Props) {
  const [copied, setCopied] = useState(false)

  const messageBody = `Hi! Here's the tile estimate from Aguirre Modern Tile (${total} total): ${url}`

  async function handleShare() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Aguirre Modern Tile — Estimate for ${customerName}`,
          text: messageBody,
          url,
        })
        return
      } catch {
        // User cancelled or share unsupported — fall through to clipboard.
      }
    }
    // Fallback: copy URL to clipboard with a confirmation tick.
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Last-resort fallback for older browsers — open mail compose.
      window.location.href = `mailto:?subject=${encodeURIComponent(
        'Aguirre Modern Tile estimate'
      )}&body=${encodeURIComponent(messageBody)}`
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-white text-gray-700 border-2 border-gray-300 rounded-lg font-semibold text-sm hover:bg-gray-50 active:scale-95 transition"
    >
      {copied ? (
        <>
          <Check className="w-4 h-4 text-green-600" />
          Link copied
        </>
      ) : (
        <>
          <Share2 className="w-4 h-4" />
          Share with spouse
        </>
      )}
    </button>
  )
}
