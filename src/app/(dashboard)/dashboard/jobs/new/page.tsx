'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import PhotoUpload from '@/components/dashboard/PhotoUpload'
import { toast } from '@/components/Toast'
import { demoTeamMembers } from '@/lib/demo'
import type { Profile } from '@/lib/supabase/types'

const JOB_TYPES = [
  'Bathroom Tile',
  'Shower Tile',
  'Floor Tile',
  'Backsplash',
  'Tile Repair',
  'Tile Reglazing',
  'Other',
]

const isDemoMode = !process.env.NEXT_PUBLIC_SUPABASE_URL

export default function NewJobPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [teamMembers, setTeamMembers] = useState<Profile[]>([])
  const [photos, setPhotos] = useState<File[]>([])

  const [form, setForm] = useState({
    title: '',
    client_name: '',
    client_phone: '',
    client_email: '',
    client_address: '',
    job_type: '',
    square_footage: '',
    scope_notes: '',
    scheduled_start: '',
    scheduled_end: '',
    estimated_days: '',
    estimated_cost: '',
    assigned_to: '',
    notes: '',
  })

  useEffect(() => {
    if (isDemoMode) {
      setTeamMembers(demoTeamMembers)
      return
    }

    async function checkOwnerAndLoadTeam() {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      const p = profile as Profile | null
      if (p?.role !== 'owner') {
        router.push('/dashboard')
        return
      }

      const { data: members } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true)
        .order('full_name')

      setTeamMembers((members ?? []) as Profile[])
    }

    checkOwnerAndLoadTeam()
  }, [router])

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (form.scheduled_start && form.scheduled_end && form.scheduled_end < form.scheduled_start) {
      setError('End date must be on or after start date')
      return
    }

    setLoading(true)

    if (isDemoMode) {
      // In demo mode, just redirect back with a success message
      toast('Demo mode: Job would be created. Connect Supabase to save real data.')
      setLoading(false)
      router.push('/dashboard')
      return
    }

    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Create the job
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          title: form.title,
          client_name: form.client_name,
          client_phone: form.client_phone || null,
          client_email: form.client_email || null,
          client_address: form.client_address || null,
          job_type: form.job_type || null,
          square_footage: form.square_footage ? parseFloat(form.square_footage) : null,
          scope_notes: form.scope_notes || null,
          scheduled_start: form.scheduled_start || null,
          scheduled_end: form.scheduled_end || null,
          estimated_days: form.estimated_days ? parseInt(form.estimated_days) : null,
          estimated_cost: form.estimated_cost ? parseFloat(form.estimated_cost) : null,
          actual_days: null,
          actual_cost: null,
          amount_invoiced: 0,
          amount_paid: 0,
          assigned_to: form.assigned_to || null,
          notes: form.notes || null,
          created_by: user.id,
          status: 'lead',
        })
        .select()
        .single()

      if (jobError) throw jobError

      // Upload photos
      if (photos.length > 0 && job) {
        for (const file of photos) {
          const ext = file.name.split('.').pop()
          const storagePath = `${job.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

          const { error: uploadError } = await supabase.storage
            .from('job-photos')
            .upload(storagePath, file)

          if (uploadError) {
            console.error('Photo upload failed:', uploadError)
            continue
          }

          await supabase.from('job_photos').insert({
            job_id: job.id,
            storage_path: storagePath,
            file_name: file.name,
            photo_type: 'reference',
            uploaded_by: user.id,
          })
        }
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to create job')
      setLoading(false)
    }
  }

  const inputClass =
    'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 text-sm'
  const labelClass = 'block text-sm font-medium text-gray-700'

  return (
    <div className="max-w-3xl">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to jobs
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Job</h1>

      {isDemoMode && (
        <div className="mb-6 rounded-md bg-amber-50 border border-amber-200 p-3">
          <p className="text-sm text-amber-800">
            <strong>Demo Mode</strong> — Form is functional but won't save. Connect Supabase to create real jobs.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Job Info */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Info</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="title" className={labelClass}>
                Job Title *
              </label>
              <input
                id="title"
                type="text"
                required
                value={form.title}
                onChange={(e) => updateField('title', e.target.value)}
                className={inputClass}
                placeholder="e.g. Master Bathroom Remodel"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="job_type" className={labelClass}>
                  Job Type
                </label>
                <select
                  id="job_type"
                  value={form.job_type}
                  onChange={(e) => updateField('job_type', e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select type...</option>
                  {JOB_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="square_footage" className={labelClass}>
                  Square Footage
                </label>
                <input
                  id="square_footage"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.square_footage}
                  onChange={(e) => updateField('square_footage', e.target.value)}
                  className={inputClass}
                  placeholder="e.g. 120"
                />
              </div>
            </div>
            <div>
              <label htmlFor="scope_notes" className={labelClass}>
                Scope of Work
              </label>
              <textarea
                id="scope_notes"
                rows={4}
                value={form.scope_notes}
                onChange={(e) => updateField('scope_notes', e.target.value)}
                className={inputClass}
                placeholder="Describe the work to be done..."
              />
            </div>
          </div>
        </section>

        {/* Client Info */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Client</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="client_name" className={labelClass}>
                Client Name *
              </label>
              <input
                id="client_name"
                type="text"
                required
                value={form.client_name}
                onChange={(e) => updateField('client_name', e.target.value)}
                className={inputClass}
                placeholder="John Smith"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="client_phone" className={labelClass}>
                  Phone
                </label>
                <input
                  id="client_phone"
                  type="tel"
                  value={form.client_phone}
                  onChange={(e) => updateField('client_phone', e.target.value)}
                  className={inputClass}
                  placeholder="(617) 555-1234"
                />
              </div>
              <div>
                <label htmlFor="client_email" className={labelClass}>
                  Email
                </label>
                <input
                  id="client_email"
                  type="email"
                  value={form.client_email}
                  onChange={(e) => updateField('client_email', e.target.value)}
                  className={inputClass}
                  placeholder="john@example.com"
                />
              </div>
            </div>
            <div>
              <label htmlFor="client_address" className={labelClass}>
                Address
              </label>
              <input
                id="client_address"
                type="text"
                value={form.client_address}
                onChange={(e) => updateField('client_address', e.target.value)}
                className={inputClass}
                placeholder="123 Main St, Revere, MA 02151"
              />
            </div>
          </div>
        </section>

        {/* Schedule */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Schedule</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="scheduled_start" className={labelClass}>
                Start Date
              </label>
              <input
                id="scheduled_start"
                type="date"
                value={form.scheduled_start}
                onChange={(e) => updateField('scheduled_start', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="scheduled_end" className={labelClass}>
                End Date
              </label>
              <input
                id="scheduled_end"
                type="date"
                value={form.scheduled_end}
                onChange={(e) => updateField('scheduled_end', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="estimated_days" className={labelClass}>
                Estimated Days
              </label>
              <input
                id="estimated_days"
                type="number"
                min="1"
                value={form.estimated_days}
                onChange={(e) => updateField('estimated_days', e.target.value)}
                className={inputClass}
                placeholder="e.g. 3"
              />
            </div>
            <div>
              <label htmlFor="estimated_cost" className={labelClass}>
                Estimated Cost ($)
              </label>
              <input
                id="estimated_cost"
                type="number"
                min="0"
                step="0.01"
                value={form.estimated_cost}
                onChange={(e) => updateField('estimated_cost', e.target.value)}
                className={inputClass}
                placeholder="e.g. 5000"
              />
            </div>
          </div>
        </section>

        {/* Assignment */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Assignment</h2>
          <div>
            <label htmlFor="assigned_to" className={labelClass}>
              Assign to
            </label>
            <select
              id="assigned_to"
              value={form.assigned_to}
              onChange={(e) => updateField('assigned_to', e.target.value)}
              className={inputClass}
            >
              <option value="">Unassigned</option>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name} ({member.role})
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Photos */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Photos</h2>
          <PhotoUpload files={photos} onChange={setPhotos} />
        </section>

        {/* Notes */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Internal Notes</h2>
          <textarea
            id="notes"
            rows={3}
            value={form.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            className={inputClass}
            placeholder="Notes visible only to the team..."
          />
        </section>

        {/* Error + Submit */}
        {error && (
          <div className="rounded-md bg-red-50 p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Job'}
          </button>
          <Link
            href="/dashboard"
            className="px-6 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
