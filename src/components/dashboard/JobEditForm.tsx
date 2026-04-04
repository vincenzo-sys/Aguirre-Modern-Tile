'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X, Save, Loader2 } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { Job, Profile } from '@/lib/supabase/types'

const JOB_TYPES = [
  'Bathroom Tile', 'Shower Tile', 'Floor Tile', 'Backsplash',
  'Tile Repair', 'Tile Reglazing', 'Other',
]

interface JobEditFormProps {
  job: Job
  teamMembers: Profile[]
}

export default function JobEditForm({ job, teamMembers }: JobEditFormProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: job.title,
    job_type: job.job_type ?? '',
    square_footage: job.square_footage?.toString() ?? '',
    scope_notes: job.scope_notes ?? '',
    scheduled_start: job.scheduled_start ?? '',
    scheduled_end: job.scheduled_end ?? '',
    estimated_days: job.estimated_days?.toString() ?? '',
    estimated_cost: job.estimated_cost?.toString() ?? '',
    actual_cost: job.actual_cost?.toString() ?? '',
    assigned_to: job.assigned_to ?? '',
    notes: job.notes ?? '',
    client_name: job.client_name,
    client_phone: job.client_phone ?? '',
    client_email: job.client_email ?? '',
    client_address: job.client_address ?? '',
  })

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          job_type: form.job_type || null,
          square_footage: form.square_footage ? parseFloat(form.square_footage) : null,
          scope_notes: form.scope_notes || null,
          scheduled_start: form.scheduled_start || null,
          scheduled_end: form.scheduled_end || null,
          estimated_days: form.estimated_days ? parseFloat(form.estimated_days) : null,
          estimated_cost: form.estimated_cost ? parseFloat(form.estimated_cost) : null,
          actual_cost: form.actual_cost ? parseFloat(form.actual_cost) : null,
          assigned_to: form.assigned_to || null,
          notes: form.notes || null,
          client_name: form.client_name,
          client_phone: form.client_phone || null,
          client_email: form.client_email || null,
          client_address: form.client_address || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }

      toast('Job updated', 'success')
      setEditing(false)
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
      >
        <Pencil className="w-4 h-4" />
        Edit
      </button>
    )
  }

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent'
  const labelClass = 'block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1'

  return (
    <div className="bg-white rounded-xl shadow-sm border border-primary-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Edit Job</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing(false)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className={labelClass}>Job Title</label>
          <input type="text" value={form.title} onChange={(e) => updateField('title', e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Client Name</label>
          <input type="text" value={form.client_name} onChange={(e) => updateField('client_name', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Client Phone</label>
          <input type="tel" value={form.client_phone} onChange={(e) => updateField('client_phone', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Client Email</label>
          <input type="email" value={form.client_email} onChange={(e) => updateField('client_email', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Address</label>
          <input type="text" value={form.client_address} onChange={(e) => updateField('client_address', e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Job Type</label>
          <select value={form.job_type} onChange={(e) => updateField('job_type', e.target.value)} className={inputClass}>
            <option value="">Select...</option>
            {JOB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Square Footage</label>
          <input type="number" value={form.square_footage} onChange={(e) => updateField('square_footage', e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Start Date</label>
          <input type="date" value={form.scheduled_start} onChange={(e) => updateField('scheduled_start', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>End Date</label>
          <input type="date" value={form.scheduled_end} onChange={(e) => updateField('scheduled_end', e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Estimated Days</label>
          <input type="number" step="0.5" value={form.estimated_days} onChange={(e) => updateField('estimated_days', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Estimated Cost ($)</label>
          <input type="number" step="0.01" value={form.estimated_cost} onChange={(e) => updateField('estimated_cost', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Actual Cost ($)</label>
          <input type="number" step="0.01" value={form.actual_cost} onChange={(e) => updateField('actual_cost', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Assign To</label>
          <select value={form.assigned_to} onChange={(e) => updateField('assigned_to', e.target.value)} className={inputClass}>
            <option value="">Unassigned</option>
            {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className={labelClass}>Scope of Work</label>
          <textarea rows={4} value={form.scope_notes} onChange={(e) => updateField('scope_notes', e.target.value)} className={inputClass} />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Internal Notes</label>
          <textarea rows={3} value={form.notes} onChange={(e) => updateField('notes', e.target.value)} className={inputClass} />
        </div>
      </div>
    </div>
  )
}
