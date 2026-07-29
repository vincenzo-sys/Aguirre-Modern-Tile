'use client'

// Inbox — one place to see and answer everything that came in: texts,
// missed calls/voicemails, and website leads, merged into one list of
// conversations sorted by latest activity. No filters, no tabs: unread
// rows are bold with a dot, and that's the whole triage model.

import { useState, useEffect, useCallback } from 'react'
import { Inbox as InboxIcon, AlertTriangle, RefreshCw } from 'lucide-react'
import type { InboxThread } from '@/lib/inbox'
import InboxRow from '@/components/inbox/InboxRow'

const POLL_INTERVAL_MS = 30_000

export default function InboxPage() {
  const [threads, setThreads] = useState<InboxThread[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/inbox', { cache: 'no-store' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setThreads(Array.isArray(data.threads) ? data.threads : [])
      setError(null)
    } catch (err) {
      // Only block the screen when there's nothing loaded yet; background
      // poll failures keep showing the last good list.
      setThreads((prev) => {
        if (prev === null) setError(err instanceof Error ? err.message : 'Failed to load')
        return prev
      })
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, POLL_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const unreadCount = threads?.filter((t) => t.unread > 0).length ?? 0

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
        <p className="text-sm text-gray-500 mt-1">
          {threads === null
            ? 'Loading…'
            : unreadCount > 0
              ? `${unreadCount} ${unreadCount === 1 ? 'conversation' : 'conversations'} waiting on you`
              : 'All caught up'}
        </p>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center mt-8">
          <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-red-900">Couldn’t load the inbox</h2>
          <p className="text-sm text-red-700 mt-1">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null)
              load()
            }}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      ) : threads === null ? (
        <ListSkeleton />
      ) : threads.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm text-center py-12">
          <InboxIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Nothing here yet.</p>
          <p className="text-sm text-gray-400 mt-1 px-6">
            Texts, missed calls, and website leads all land in this list as they come in.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-100">
          {threads.map((t) => (
            <InboxRow key={t.key} thread={t} />
          ))}
        </div>
      )}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-100">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/3 bg-gray-100 rounded animate-pulse" />
            <div className="h-3 w-2/3 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}
