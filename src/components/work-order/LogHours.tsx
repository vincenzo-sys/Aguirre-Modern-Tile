'use client'

import { useEffect, useState } from 'react'
import { Clock, Loader2, Check } from 'lucide-react'

type Crew = { id: string; name: string }
type Entry = { id: string; work_date: string; hours: number; name: string }

function todayLocal(): string {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

// Crew self-log hours from the work order link — no login, no money shown.
// Small client island so the rest of the work order page stays server-rendered.
export default function LogHours({ token }: { token: string }) {
  const [crew, setCrew] = useState<Crew[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [crewId, setCrewId] = useState('')
  const [hours, setHours] = useState('8')
  const [date, setDate] = useState(todayLocal())
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  async function load() {
    try {
      const res = await fetch(`/api/public/work-orders/${token}/labor`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setCrew(data.crew ?? [])
      setEntries(data.entries ?? [])
      if (!crewId && data.crew?.[0]?.id) setCrewId(data.crew[0].id)
    } catch {
      // offline / transient — leave the form usable, submit will surface errors
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function submit() {
    const h = Number(hours)
    if (!crewId || !Number.isFinite(h) || h <= 0 || h > 24) return
    setSaving(true)
    setJustSaved(false)
    try {
      const res = await fetch(`/api/public/work-orders/${token}/labor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crew_member_id: crewId, hours: h, work_date: date }),
      })
      if (!res.ok) throw new Error('Failed')
      setJustSaved(true)
      await load()
    } catch {
      // keep the form state so the crew can retry
    } finally {
      setSaving(false)
    }
  }

  if (crew.length === 0) return null

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        <Clock className="w-4 h-4 text-gray-400" />
        Log your hours
      </h2>

      <div className="space-y-2">
        <select
          value={crewId}
          onChange={(e) => { setCrewId(e.target.value); setJustSaved(false) }}
          disabled={saving}
          aria-label="Who are you?"
          className="w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {crew.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={24}
            step={0.5}
            value={hours}
            onChange={(e) => { setHours(e.target.value); setJustSaved(false) }}
            disabled={saving}
            aria-label="Hours worked"
            className="w-24 min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setJustSaved(false) }}
            disabled={saving}
            aria-label="Work date"
            className="flex-1 min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={saving || !crewId}
          className="w-full inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-3 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 active:scale-95 transition disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : justSaved ? <Check className="w-4 h-4" /> : null}
          {saving ? 'Saving…' : justSaved ? 'Saved' : 'Save my hours'}
        </button>
      </div>

      {entries.length > 0 && (
        <ul className="mt-4 pt-4 border-t border-gray-100 space-y-1.5">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between text-sm text-gray-700">
              <span>
                <span className="font-medium">{e.name}</span>
                <span className="text-gray-400"> · {fmtDate(e.work_date)}</span>
              </span>
              <span className="text-gray-900 font-medium tabular-nums">{e.hours} hr</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
