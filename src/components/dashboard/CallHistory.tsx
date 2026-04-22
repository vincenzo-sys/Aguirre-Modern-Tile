'use client'

import { useState } from 'react'
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, ChevronDown, ChevronUp, Play } from 'lucide-react'

export interface CallLogEntry {
  id: string
  phone_number: string
  direction: 'inbound' | 'outbound' | string
  status: 'completed' | 'missed' | string
  duration: number | null
  recording_url: string | null
  transcript: string | null
  openphone_call_id: string | null
  created_at: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDuration(sec: number | null): string {
  if (!sec || sec <= 0) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function iconFor(direction: string, status: string) {
  if (status === 'missed') return <PhoneMissed className="w-4 h-4 text-red-600" />
  if (direction === 'inbound') return <PhoneIncoming className="w-4 h-4 text-green-600" />
  if (direction === 'outbound') return <PhoneOutgoing className="w-4 h-4 text-blue-600" />
  return <Phone className="w-4 h-4 text-gray-500" />
}

export default function CallHistory({ calls }: { calls: CallLogEntry[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (calls.length === 0) {
    return null
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
      <div className="flex items-center gap-2 text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">
        <Phone className="w-3.5 h-3.5" />
        Call history ({calls.length})
      </div>
      <ul className="divide-y divide-gray-100">
        {calls.map((call) => {
          const isOpen = expanded.has(call.id)
          const hasTranscript = Boolean(call.transcript && call.transcript.trim().length > 0)
          return (
            <li key={call.id} className="py-3">
              <div className="flex items-center gap-3">
                <div className="shrink-0">{iconFor(call.direction, call.status)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">
                    {call.direction === 'outbound' ? 'Outbound' : 'Inbound'} · {call.phone_number}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(call.created_at)} · {formatDuration(call.duration)}
                    {call.status === 'missed' && ' · missed'}
                    {!hasTranscript && call.duration && call.duration > 0 && ' · transcript pending'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {call.recording_url && (
                    <a
                      href={call.recording_url}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                      title="Listen to recording"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {hasTranscript && (
                    <button
                      type="button"
                      onClick={() => toggle(call.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-800"
                    >
                      {isOpen ? (
                        <>
                          Hide <ChevronUp className="w-3.5 h-3.5" />
                        </>
                      ) : (
                        <>
                          Transcript <ChevronDown className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
              {isOpen && hasTranscript && (
                <pre className="mt-2 ml-7 p-3 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-700 whitespace-pre-wrap font-sans overflow-x-auto">
                  {call.transcript}
                </pre>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
