'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X, Save, Loader2 } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { Customer } from '@/lib/supabase/types'

interface EditCustomerFormProps {
  customer: Pick<Customer, 'id' | 'name' | 'email' | 'phone' | 'address' | 'city' | 'state' | 'zip'>
  variant?: 'button' | 'icon'
  label?: string
}

export default function EditCustomerForm({ customer, variant = 'button', label = 'Edit' }: EditCustomerFormProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: customer.name ?? '',
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    address: customer.address ?? '',
    city: customer.city ?? '',
    state: customer.state ?? '',
    zip: customer.zip ?? '',
  })

  function updateField(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast('Name is required', 'error')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          city: form.city.trim() || null,
          state: form.state.trim() || null,
          zip: form.zip.trim() || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save')
      }

      toast('Customer updated', 'success')
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  const trigger =
    variant === 'icon' ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-gray-400 hover:text-white transition-colors"
        aria-label="Edit customer"
      >
        <Pencil className="w-4 h-4" />
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
      >
        <Pencil className="w-4 h-4" />
        {label}
      </button>
    )

  if (!open) return trigger

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent'
  const labelClass = 'block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1'

  return (
    <>
      {trigger}
      <div
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
        onClick={() => !saving && setOpen(false)}
      >
        <div
          className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-xl my-8"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Edit customer</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={saving}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                className={inputClass}
                autoFocus
              />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                className={inputClass}
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                className={inputClass}
                placeholder="name@example.com"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
                className={inputClass}
                placeholder="123 Main St"
              />
            </div>
            <div>
              <label className={labelClass}>City</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => updateField('city', e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>State</label>
                <input
                  type="text"
                  value={form.state}
                  onChange={(e) => updateField('state', e.target.value)}
                  className={inputClass}
                  maxLength={2}
                  placeholder="TX"
                />
              </div>
              <div>
                <label className={labelClass}>ZIP</label>
                <input
                  type="text"
                  value={form.zip}
                  onChange={(e) => updateField('zip', e.target.value)}
                  className={inputClass}
                  placeholder="78701"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
