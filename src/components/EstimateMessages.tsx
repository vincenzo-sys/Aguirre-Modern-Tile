'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Loader2, MessageCircle } from 'lucide-react'

// Shared customer ↔ Aguirre conversation thread used on:
//   - Public estimate page    /estimates/[token]      (mode='customer')
//   - Dashboard job detail    /dashboard/jobs/[id]    (mode='aguirre')
//
// Both sides hit different endpoints and label their own messages
// differently, but the rendered shape is identical.

export interface EstimateMessage {
  id: string
  sender: 'customer' | 'aguirre'
  sender_name: string | null
  body: string
  created_at: string
  read_at?: string | null
}

interface Props {
  // Customer mode: posts to /api/public/estimates/[token]/messages
  // Aguirre mode:   posts to /api/jobs/[id]/messages
  mode: 'customer' | 'aguirre'
  endpoint: string
  // Optional name to send with the post — Aguirre mode lets Vince customize
  // (e.g., "Christian" if Christian is replying); customer side defaults
  // to job.client_name and we don't ask.
  defaultSenderName?: string
}

const POLL_INTERVAL_MS = 30_000

export default function EstimateMessages({ mode, endpoint, defaultSenderName }: Props) {
  const [messages, setMessages] = useState<EstimateMessage[] | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoint, { cache: 'no-store' })
      if (!res.ok) throw new Error(`load failed (${res.status})`)
      const data = await res.json()
      setMessages(Array.isArray(data.messages) ? data.messages : [])
    } catch (err) {
      // Silent on background polls — only surface errors that happen during
      // an explicit user action (send).
      console.error('[messages] load error:', err)
    }
  }, [endpoint])

  // Initial load + 30s poll + refetch on tab focus. The focus refetch is
  // what makes "I just sent a reply, will I see it?" feel instant when the
  // other side is also in the page.
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

  // Auto-scroll the thread to the newest message on update. Only scrolls
  // the local thread container, not the whole page — important on the
  // public estimate where the thread sits inside a long scrolling page.
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages?.length])

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setError(null)

    // Optimistic insert so the textarea clears + the message shows up
    // immediately, even before the server confirms. Replaced when the
    // server response (or the next poll) returns the canonical row.
    const optimistic: EstimateMessage = {
      id: `optimistic-${Date.now()}`,
      sender: mode,
      sender_name: defaultSenderName ?? (mode === 'aguirre' ? 'Vince' : 'You'),
      body,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...(prev ?? []), optimistic])
    setDraft('')

    try {
      const payload: Record<string, unknown> = { body }
      if (mode === 'aguirre' && defaultSenderName) payload.sender_name = defaultSenderName
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || `Send failed (${res.status})`)
      }
      // Reconcile by reloading. Cheaper than splicing the optimistic row out
      // and inserting the canonical one — the API call is small.
      await load()
    } catch (err) {
      // Roll back the optimistic insert and show the error.
      setMessages((prev) => prev?.filter((m) => m.id !== optimistic.id) ?? null)
      setDraft(body)
      setError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl+Enter sends. Plain Enter is a newline because some questions
    // are paragraphs.
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      send()
    }
  }

  const empty = messages !== null && messages.length === 0
  const introCopy = mode === 'customer'
    ? 'Have a question about your estimate? Ask here — Vince usually replies within an hour. You’ll get a text and email when he does.'
    : 'Customer-facing thread. Replies are sent to the customer by SMS + email automatically.'

  return (
    <section id="messages" className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-1">
        <MessageCircle className="w-5 h-5 text-primary-600" />
        <h2 className="text-lg font-bold text-gray-900">
          {mode === 'customer' ? 'Questions or comments' : 'Customer questions'}
        </h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">{introCopy}</p>

      {/* Thread */}
      <div
        ref={threadRef}
        className="space-y-3 max-h-96 overflow-y-auto pr-1 mb-4"
        aria-live="polite"
      >
        {messages === null ? (
          <p className="text-sm text-gray-400 italic py-4 text-center">Loading…</p>
        ) : empty ? (
          <p className="text-sm text-gray-400 italic py-4 text-center">
            {mode === 'customer' ? 'No questions yet — type below to start the thread.' : 'No customer questions yet.'}
          </p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} m={m} viewerMode={mode} />)
        )}
      </div>

      {/* Composer */}
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          maxLength={4000}
          placeholder={
            mode === 'customer'
              ? 'Ask a question, mention something you want to change, or just say hi…'
              : 'Type a reply to the customer…'
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-y"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {draft.length > 0 && `${draft.length}/4000 · ⌘/Ctrl+Enter to send`}
          </span>
          <button
            type="button"
            onClick={send}
            disabled={sending || draft.trim().length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Sending…' : mode === 'customer' ? 'Send to Vince' : 'Send reply'}
          </button>
        </div>
      </div>
    </section>
  )
}

function MessageBubble({ m, viewerMode }: { m: EstimateMessage; viewerMode: 'customer' | 'aguirre' }) {
  const mine = m.sender === viewerMode
  const label = m.sender === 'aguirre' ? (m.sender_name || 'Aguirre Modern Tile') : (m.sender_name || 'Customer')
  const time = formatTimeAgo(m.created_at)

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${mine ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div className="flex items-baseline gap-2 text-xs">
          <span className={`font-semibold ${mine ? 'text-primary-700' : 'text-gray-700'}`}>{label}</span>
          <span className="text-gray-400">{time}</span>
        </div>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
            mine
              ? 'bg-primary-600 text-white rounded-br-sm'
              : 'bg-gray-100 text-gray-900 rounded-bl-sm'
          }`}
        >
          {m.body}
        </div>
      </div>
    </div>
  )
}

function formatTimeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
