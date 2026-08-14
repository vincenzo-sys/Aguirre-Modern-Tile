'use client'

import { useEffect, useRef } from 'react'

// Cloudflare Turnstile widget.
//
// Renders NOTHING and costs nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is
// unset, so the site works identically before and after the keys are added.
// The server side (verifyTurnstile in src/lib/spamCheck.ts) degrades the same
// way: no key means no signal, rather than a failure that would quarantine
// every real customer.
//
// Explicit rendering rather than the `cf-turnstile` auto-render class: React
// owns this subtree and remounts it, and the implicit renderer will happily
// stack a second widget into the same node on the second pass.

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      remove: (id: string) => void
      reset: (id: string) => void
    }
    onloadTurnstileCallback?: () => void
  }
}

const SCRIPT_ID = 'cf-turnstile-script'
const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onloadTurnstileCallback'

/** Resolves once the Turnstile script has loaded. Shared across widgets. */
let scriptPromise: Promise<void> | null = null

function loadTurnstile(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve) => {
    window.onloadTurnstileCallback = () => resolve()
    if (document.getElementById(SCRIPT_ID)) return
    const s = document.createElement('script')
    s.id = SCRIPT_ID
    s.src = SCRIPT_SRC
    s.async = true
    s.defer = true
    // A blocked or failed script must not hang the form forever — resolve and
    // let the submission go through with no token, which the server scores as
    // a weak 'missing' signal rather than a rejection.
    s.onerror = () => resolve()
    document.head.appendChild(s)
  })
  return scriptPromise
}

interface TurnstileWidgetProps {
  /** Called with the token, or '' when it expires and needs re-solving. */
  onToken: (token: string) => void
}

export default function TurnstileWidget({ onToken }: TurnstileWidgetProps) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const ref = useRef<HTMLDivElement>(null)
  // Keep the latest callback without making it a dependency — re-rendering the
  // widget on every parent state change would reset the challenge mid-form.
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    if (!siteKey || !ref.current) return
    let widgetId: string | null = null
    let cancelled = false
    const el = ref.current

    loadTurnstile().then(() => {
      if (cancelled || !window.turnstile || !el) return
      try {
        widgetId = window.turnstile.render(el, {
          sitekey: siteKey,
          action: 'quote-form',
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(''),
          'error-callback': () => onTokenRef.current(''),
          theme: 'light',
        })
      } catch {
        // Already rendered, or the script is in a bad state. Submitting with
        // no token is a survivable outcome by design.
      }
    })

    return () => {
      cancelled = true
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId)
        } catch {
          // Widget already gone.
        }
      }
    }
  }, [siteKey])

  if (!siteKey) return null
  return <div ref={ref} className="my-2" />
}
