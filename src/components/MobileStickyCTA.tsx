'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Phone, MessageCircle } from 'lucide-react'

interface Props {
  phone: string
}

// Sticky bottom action bar shown on all marketing pages on phones. Hidden
// on lg+ screens (desktop has the header CTA). Hidden on pages that already
// have their own primary CTA in the same screen position (/contact, /quote/*,
// the public estimate viewer at /estimates/*) so we don't double-stack
// fixed-position buttons.
export default function MobileStickyCTA({ phone }: Props) {
  const pathname = usePathname() || ''
  const phoneDigits = phone.replace(/\D/g, '')

  const hideOn = ['/contact', '/quote', '/estimates', '/book-online']
  if (hideOn.some((p) => pathname.startsWith(p))) return null

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch gap-2 px-3 py-2.5">
        <a
          href={`tel:${phoneDigits}`}
          className="flex-1 flex items-center justify-center gap-2 bg-primary-600 text-white rounded-lg py-3 font-semibold text-sm active:scale-95 transition shadow-sm"
        >
          <Phone className="w-4 h-4" />
          <span>Call</span>
          <span className="text-primary-100 font-normal">·</span>
          <span className="font-normal text-primary-100 truncate">{phone}</span>
        </a>
        <Link
          href="/contact"
          className="flex items-center justify-center gap-2 bg-white text-primary-700 border-2 border-primary-600 rounded-lg px-4 py-3 font-semibold text-sm active:scale-95 transition"
        >
          <MessageCircle className="w-4 h-4" />
          <span>Estimate</span>
        </Link>
      </div>
      <div className="text-center pb-1">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          We answer in 5 minutes
        </span>
      </div>
    </div>
  )
}
