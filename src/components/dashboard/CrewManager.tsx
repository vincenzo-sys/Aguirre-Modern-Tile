'use client'

import { useEffect, useState } from 'react'
import { Plus, Loader2, HardHat, Save, X } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { CrewMember } from '@/lib/supabase/types'

const ROLES = ['installer', 'lead', 'helper']

function fmtRate(n: number | null): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)
}

export default function CrewManager({ initialCrew }: { initialCrew: CrewMember[] }) {
  const [crew, setCrew] = useState<CrewMember[]>(initialCrew)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  async function load() {
    try {
      const res = await fetch('/api/crew?all=1', { cache: 'no-store' })
      if (res.ok) setCrew(await res.json())
    } catch {
      /* leave existing list */
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <HardHat className="w-6 h-6 text-primary-600" />
            Crew
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Your install crew, rates, and who&apos;s active. Used for scheduling and labor costing.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" />
            Add crew
          </button>
        )}
      </div>

      {adding && (
        <CrewRowEditor
          onCancel={() => setAdding(false)}
          onSaved={() => { setAdding(false); load() }}
        />
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100 mt-4">
        {crew.length === 0 && !adding && (
          <p className="p-6 text-sm text-gray-400 italic text-center">No crew yet. Add your first installer.</p>
        )}
        {crew.map((c) =>
          editingId === c.id ? (
            <CrewRowEditor
              key={c.id}
              member={c}
              onCancel={() => setEditingId(null)}
              onSaved={() => { setEditingId(null); load() }}
            />
          ) : (
            <button
              key={c.id}
              onClick={() => setEditingId(c.id)}
              className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-gray-50"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  {c.nickname || c.full_name}
                  {!c.is_active && (
                    <span className="text-[11px] font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">Inactive</span>
                  )}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {c.role}{c.phone ? ` · ${c.phone}` : ''}
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="text-gray-900 font-medium">{fmtRate(c.day_rate)}/day</p>
                <p className="text-xs text-gray-400">
                  {c.hour_rate != null ? `${fmtRate(c.hour_rate)}/hr` : 'hr derived'}
                </p>
              </div>
            </button>
          )
        )}
      </div>
    </div>
  )
}

function CrewRowEditor({
  member,
  onCancel,
  onSaved,
}: {
  member?: CrewMember
  onCancel: () => void
  onSaved: () => void
}) {
  const [fullName, setFullName] = useState(member?.full_name ?? '')
  const [nickname, setNickname] = useState(member?.nickname ?? '')
  const [phone, setPhone] = useState(member?.phone ?? '')
  const [role, setRole] = useState(member?.role ?? 'installer')
  const [dayRate, setDayRate] = useState(String(member?.day_rate ?? 250))
  const [hourRate, setHourRate] = useState(member?.hour_rate != null ? String(member.hour_rate) : '')
  const [isActive, setIsActive] = useState(member?.is_active ?? true)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!fullName.trim()) {
      toast('Name is required', 'error')
      return
    }
    setSaving(true)
    const payload = {
      full_name: fullName.trim(),
      nickname: nickname.trim() || null,
      phone: phone.trim() || null,
      role,
      day_rate: Number(dayRate) || 0,
      hour_rate: hourRate.trim() === '' ? null : Number(hourRate),
      is_active: isActive,
    }
    try {
      const res = await fetch(member ? `/api/crew/${member.id}` : '/api/crew', {
        method: member ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed')
      toast(member ? 'Crew updated' : 'Crew added')
      onSaved()
    } catch {
      toast('Could not save', 'error')
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="p-4 bg-primary-50/40">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input className={inputCls} placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <input className={inputCls} placeholder="Nickname (optional)" value={nickname} onChange={(e) => setNickname(e.target.value)} />
        <input className={inputCls} placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => (
            <option key={r} value={r} className="capitalize">{r}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <span className="w-24">Day rate $</span>
          <input className={`${inputCls} flex-1`} type="number" inputMode="decimal" value={dayRate} onChange={(e) => setDayRate(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <span className="w-24">Hour rate $</span>
          <input className={`${inputCls} flex-1`} type="number" inputMode="decimal" placeholder="day/8" value={hourRate} onChange={(e) => setHourRate(e.target.value)} />
        </label>
      </div>
      <div className="flex items-center justify-between mt-3">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
