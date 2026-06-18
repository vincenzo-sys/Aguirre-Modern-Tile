'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Loader2, Plus, X } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { CrewMember, LaborEntryWithMember } from '@/lib/supabase/types'

// Today as a local YYYY-MM-DD (not UTC) so "today" matches the field worker's day.
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

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)
}

export default function LaborLog({
  jobId,
  crewMembers,
  initialEntries,
  isOwner,
}: {
  jobId: string
  crewMembers: CrewMember[]
  initialEntries: LaborEntryWithMember[]
  isOwner: boolean
}) {
  const router = useRouter()
  const [entries, setEntries] = useState<LaborEntryWithMember[]>(initialEntries)
  const [crewId, setCrewId] = useState<string>(crewMembers[0]?.id ?? '')
  const [hours, setHours] = useState<string>('8')
  const [date, setDate] = useState<string>(todayLocal())
  const [saving, setSaving] = useState(false)

  const totals = useMemo(() => {
    const hrs = entries.reduce((s, e) => s + (Number(e.hours) || 0), 0)
    const cost = entries.reduce((s, e) => s + (Number(e.labor_cost) || 0), 0)
    return { hrs, cost }
  }, [entries])

  async function save() {
    const h = Number(hours)
    if (!crewId) {
      toast('Pick a crew member', 'error')
      return
    }
    if (!Number.isFinite(h) || h <= 0 || h > 24) {
      toast('Hours must be between 0 and 24', 'error')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/labor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crew_member_id: crewId, hours: h, work_date: date }),
      })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      // Upsert the returned entry into local state (replace same person/day).
      setEntries((prev) => {
        const next = prev.filter(
          (e) => !(e.crew_member_id === crewId && e.work_date === date)
        )
        return [...next, data.entry].sort((a, b) => a.work_date.localeCompare(b.work_date))
      })
      toast('Hours saved')
      router.refresh()
    } catch {
      toast('Could not save hours', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function remove(entry: LaborEntryWithMember) {
    const previous = entries
    setEntries((prev) => prev.filter((e) => e.id !== entry.id))
    try {
      const res = await fetch(`/api/jobs/${jobId}/labor?entry_id=${entry.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      toast('Entry removed')
      router.refresh()
    } catch {
      setEntries(previous)
      toast('Could not remove entry', 'error')
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Clock className="w-4 h-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">Labor hours</h3>
        {isOwner && entries.length > 0 && (
          <span className="text-xs font-medium text-gray-600 ml-auto">
            Labor so far: {fmtCurrency(totals.cost)} · {totals.hrs} hr
          </span>
        )}
      </div>

      {crewMembers.length === 0 ? (
        <p className="text-sm text-gray-400 italic">
          No crew members yet. Add crew in Settings → Crew.
        </p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <select
            value={crewId}
            onChange={(e) => setCrewId(e.target.value)}
            disabled={saving}
            className="flex-1 min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {crewMembers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nickname || c.full_name}
              </option>
            ))}
          </select>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={24}
            step={0.5}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            disabled={saving}
            aria-label="Hours"
            className="w-full sm:w-24 min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={saving}
            aria-label="Work date"
            className="w-full sm:w-auto min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving || !crewId}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Save hours
          </button>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No hours logged yet.</p>
      ) : (
        <ul className="space-y-1.5 max-h-80 overflow-y-auto">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-3 text-sm bg-gray-50 px-3 py-2 rounded border border-gray-100"
            >
              <span className="text-gray-700">
                <span className="font-medium">{e.crew_member?.nickname || e.crew_member?.full_name || 'Crew'}</span>
                <span className="text-gray-400"> · {fmtDate(e.work_date)}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-gray-900 font-medium">{e.hours} hr</span>
                {isOwner && <span className="text-gray-400">{fmtCurrency(Number(e.labor_cost) || 0)}</span>}
                <button
                  type="button"
                  onClick={() => remove(e)}
                  aria-label="Remove entry"
                  className="text-gray-300 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
