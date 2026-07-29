'use client'

import { useState, useEffect, useRef, useCallback, Fragment } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Voicemail,
  Play,
  ChevronDown,
  ChevronUp,
  Send,
  Loader2,
  UserPlus,
} from 'lucide-react'
import type { InboxThread } from '@/lib/inbox'
import { formatPhoneDisplay } from '@/components/dashboard/leads/formatters'

// Full conversation for one phone number: SMS bubbles and call rows merged
// chronologically, with a reply-by-SMS composer. Mechanics (optimistic send,
// 30s poll, focus refetch, auto-scroll) follow EstimateMessages; the data
// shape here is the mixed timeline from /api/inbox/[key], so the component
// is its own thing rather than a parameterization of the estimate thread.

type SmsItem = {
  type: 'sms'
  id: string
  direction: 'inbound' | 'outbound'
  body: string
  trigger_type: string
  status: string
  at: string
}

type CallItem = {
  type: 'call'
  id: string
  direction: 'inbound' | 'outbound'
  status: string
  duration: number | null
  recording_url: string | null
  transcript: string | null
  at: string
}

type ThreadItem = SmsItem | CallItem

const POLL_INTERVAL_MS = 30_000

// Human captions for automated sends, so Vince can tell his own words from
// the robot's ("auto: missed call" under the bubble).
const AUTOMATED_TRIGGERS_EXEMPT = new Set(['customer_reply', 'inbox_reply'])

export default function ThreadView({ threadKey }: { threadKey: string }) {
  const [contact, setContact] = useState<InboxThread | null>(null)
  const [items, setItems] = useState<ThreadItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/inbox/${threadKey}`, { cache: 'no-store' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setContact(data.contact ?? null)
      setItems(Array.isArray(data.items) ? data.items : [])
      setError(null)
    } catch (err) {
      // Surface load errors only when there's nothing on screen yet;
      // background polls fail silently.
      setItems((prev) => {
        if (prev === null) setError(err instanceof Error ? err.message : 'Failed to load')
        return prev
      })
    }
  }, [threadKey])

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

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [items?.length])

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setSendError(null)

    const optimistic: SmsItem = {
      type: 'sms',
      id: `optimistic-${Date.now()}`,
      direction: 'outbound',
      body,
      trigger_type: 'inbox_reply',
      status: 'sending',
      at: new Date().toISOString(),
    }
    setItems((prev) => [...(prev ?? []), optimistic])
    setDraft('')

    try {
      const res = await fetch(`/api/inbox/${threadKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || `Send failed (${res.status})`)
      }
      await load()
    } catch (err) {
      setItems((prev) => prev?.filter((i) => i.id !== optimistic.id) ?? null)
      setDraft(body)
      setSendError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      send()
    }
  }

  const phone = contact?.phone_e164 ?? contact?.phone_raw ?? threadKey
  const name = contact?.display_name ?? formatPhoneDisplay(phone)

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Link
          href="/dashboard/inbox"
          aria-label="Back to inbox"
          className="p-2 -ml-2 rounded-lg text-gray-500 hover:bg-gray-100 active:scale-95 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 truncate">{name || 'Unknown number'}</h1>
          {contact?.display_name && (
            <p className="text-xs text-gray-500">{formatPhoneDisplay(phone)}</p>
          )}
        </div>
        <a
          href={`tel:${phone}`}
          aria-label={`Call ${name}`}
          className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-lg border border-gray-200 text-primary-700 active:scale-95 transition"
        >
          <Phone className="w-5 h-5" />
        </a>
        {contact?.lead ? (
          <Link
            href={`/dashboard/leads/${contact.lead.id}`}
            className="shrink-0 inline-flex items-center px-3 min-h-[44px] rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 active:scale-95 transition"
          >
            Open lead
          </Link>
        ) : contact?.customer_id ? (
          <Link
            href={`/dashboard/customers/${contact.customer_id}`}
            className="shrink-0 inline-flex items-center px-3 min-h-[44px] rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 active:scale-95 transition"
          >
            Customer
          </Link>
        ) : (
          <Link
            href={`/dashboard/leads/new?phone=${encodeURIComponent(phone)}`}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg border border-primary-200 bg-primary-50 text-primary-700 text-sm font-semibold active:scale-95 transition"
          >
            <UserPlus className="w-4 h-4" />
            New lead
          </Link>
        )}
      </div>

      {/* Timeline */}
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-sm text-red-700">
          {error}
        </div>
      ) : items === null ? (
        <div className="space-y-3 py-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-12 rounded-2xl bg-gray-100 animate-pulse ${i % 2 ? 'ml-16' : 'mr-16'}`}
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 italic text-center py-10">
          No messages yet — send the first text below.
        </p>
      ) : (
        <Timeline items={items} />
      )}
      <div ref={endRef} />

      {/* Composer */}
      <div className="mt-4 space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={1600}
          placeholder={`Text ${contact?.display_name?.split(' ')[0] ?? 'this number'}…`}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-y"
        />
        {sendError && <p className="text-xs text-red-600">{sendError}</p>}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {draft.length > 0 && `${draft.length}/1600 · sends as SMS`}
          </span>
          <button
            type="button"
            onClick={send}
            disabled={sending || draft.trim().length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Sending…' : 'Send text'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Timeline pieces ───────────────────────────────────────────────

function Timeline({ items }: { items: ThreadItem[] }) {
  let lastDay = ''
  return (
    <div className="space-y-3" aria-live="polite">
      {items.map((item) => {
        const day = new Date(item.at).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
        const showDivider = day !== lastDay
        lastDay = day
        return (
          <Fragment key={`${item.type}-${item.id}`}>
            {showDivider && (
              <div className="flex items-center gap-3 pt-2">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                  {day}
                </span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
            )}
            {item.type === 'sms' ? <SmsBubble item={item} /> : <CallRow item={item} />}
          </Fragment>
        )
      })}
    </div>
  )
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function SmsBubble({ item }: { item: SmsItem }) {
  const mine = item.direction === 'outbound'
  const automated = mine && !AUTOMATED_TRIGGERS_EXEMPT.has(item.trigger_type)
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] flex flex-col gap-0.5 ${mine ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
            mine ? 'bg-primary-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm'
          }`}
        >
          {item.body}
        </div>
        <span className="text-[11px] text-gray-400 px-1">
          {automated && <span className="font-medium">auto: {item.trigger_type.replace(/_/g, ' ')} · </span>}
          {timeOf(item.at)}
          {item.status === 'failed' && <span className="text-red-600 font-semibold"> · failed</span>}
          {item.status === 'sending' && ' · sending…'}
        </span>
      </div>
    </div>
  )
}

function CallRow({ item }: { item: CallItem }) {
  const [open, setOpen] = useState(false)
  const missed = item.status === 'missed' || item.status === 'voicemail'
  const icon =
    item.status === 'voicemail' ? (
      <Voicemail className="w-4 h-4 text-red-600" />
    ) : item.status === 'missed' ? (
      <PhoneMissed className="w-4 h-4 text-red-600" />
    ) : item.direction === 'outbound' ? (
      <PhoneOutgoing className="w-4 h-4 text-blue-600" />
    ) : (
      <PhoneIncoming className="w-4 h-4 text-green-600" />
    )
  const label =
    item.status === 'voicemail'
      ? 'Voicemail'
      : item.status === 'missed'
        ? 'Missed call'
        : item.direction === 'outbound'
          ? 'Outgoing call'
          : 'Incoming call'
  const duration =
    item.duration && item.duration > 0
      ? ` · ${Math.floor(item.duration / 60)}m ${item.duration % 60}s`
      : ''

  return (
    <div className="mx-auto w-full max-w-md">
      <div
        className={`rounded-xl border px-3 py-2 ${missed ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-200'}`}
      >
        <div className="flex items-center gap-2 text-sm">
          {icon}
          <span className={`font-medium ${missed ? 'text-red-800' : 'text-gray-700'}`}>
            {label}
            <span className="font-normal text-gray-500">{duration}</span>
          </span>
          <span className="ml-auto text-[11px] text-gray-400">{timeOf(item.at)}</span>
        </div>
        {(item.transcript || item.recording_url) && (
          <div className="mt-1.5 flex items-center gap-3">
            {item.transcript && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 min-h-[32px]"
              >
                {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Transcript
              </button>
            )}
            {item.recording_url && (
              <a
                href={item.recording_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 min-h-[32px]"
              >
                <Play className="w-3.5 h-3.5" />
                Recording
              </a>
            )}
          </div>
        )}
        {open && item.transcript && (
          <p className="mt-2 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed border-t border-gray-200 pt-2">
            {item.transcript}
          </p>
        )}
      </div>
    </div>
  )
}
