'use client'

import { useState, useEffect } from 'react'

// Unread-conversation count for the Inbox nav badge. Polls /api/inbox/badge
// every 60s + on tab focus; fails silently (a badge that briefly lags is
// better than error toasts from the nav). Pass enabled=false for roles
// without the Inbox (crew) so they don't poll for a badge they can't see.
const POLL_INTERVAL_MS = 60_000

export function useInboxBadge(enabled = true): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch('/api/inbox/badge', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && typeof data.count === 'number') setCount(data.count)
      } catch {
        // silent — next poll retries
      }
    }

    load()
    const interval = setInterval(load, POLL_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled])

  return count
}
