'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X, Save, Loader2, Plus } from 'lucide-react'
import { toast } from '@/components/Toast'

interface Props {
  jobId: string
  warrantyText: string | null
  paymentTermsText: string | null
  paymentMethods: string[] | null
  customerProvides: string | null
}

// Surfaces the four estimate-text fields that get snapshotted onto each job
// from estimate_defaults at generate time. Each is editable in place so Vince
// can tweak wording per-job without affecting already-issued estimates.
export default function EstimateTextEditor({
  jobId,
  warrantyText,
  paymentTermsText,
  paymentMethods,
  customerProvides,
}: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [methodInput, setMethodInput] = useState('')
  const [form, setForm] = useState({
    warranty_text: warrantyText ?? '',
    payment_terms_text: paymentTermsText ?? '',
    payment_methods: paymentMethods ?? [],
    customer_provides: customerProvides ?? '',
  })

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function addMethod() {
    const v = methodInput.trim()
    if (!v) return
    if (form.payment_methods.includes(v)) {
      setMethodInput('')
      return
    }
    update('payment_methods', [...form.payment_methods, v])
    setMethodInput('')
  }

  function removeMethod(idx: number) {
    update('payment_methods', form.payment_methods.filter((_, i) => i !== idx))
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warranty_text: form.warranty_text || null,
          payment_terms_text: form.payment_terms_text || null,
          payment_methods: form.payment_methods.length > 0 ? form.payment_methods : null,
          customer_provides: form.customer_provides || null,
        }),
      })
      if (!res.ok) throw new Error('save failed')
      toast('Estimate text saved', 'success')
      setEditing(false)
      router.refresh()
    } catch {
      toast('Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setForm({
      warranty_text: warrantyText ?? '',
      payment_terms_text: paymentTermsText ?? '',
      payment_methods: paymentMethods ?? [],
      customer_provides: customerProvides ?? '',
    })
    setEditing(false)
  }

  // ── Read-only view ──
  if (!editing) {
    const allEmpty =
      !warrantyText && !paymentTermsText && (!paymentMethods || paymentMethods.length === 0) && !customerProvides
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Estimate text
          </h3>
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        </div>
        {allEmpty ? (
          <p className="text-sm text-gray-400 italic">
            No estimate text yet — generate the estimate or click Edit to set warranty / payment terms / customer provides for this job.
          </p>
        ) : (
          <dl className="space-y-3 text-sm">
            <ReadOnlyField label="Warranty" value={warrantyText} />
            <ReadOnlyField label="Payment terms" value={paymentTermsText} />
            {paymentMethods && paymentMethods.length > 0 && (
              <div>
                <dt className="text-xs font-medium text-gray-500 mb-1">Payment methods</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {paymentMethods.map((m) => (
                    <span key={m} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">
                      {m}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            <ReadOnlyField label="Customer is providing" value={customerProvides} />
          </dl>
        )}
      </div>
    )
  }

  // ── Editing view ──
  return (
    <div className="bg-white border border-primary-200 rounded-xl p-4 ring-1 ring-primary-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Editing estimate text
        </h3>
        <div className="flex gap-2">
          <button
            onClick={cancel}
            disabled={saving}
            className="text-xs text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="text-xs px-3 py-1 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 inline-flex items-center gap-1"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Warranty</label>
          <textarea
            value={form.warranty_text}
            onChange={(e) => update('warranty_text', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Payment terms</label>
          <textarea
            value={form.payment_terms_text}
            onChange={(e) => update('payment_terms_text', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Payment methods</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.payment_methods.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">
                {m}
                <button onClick={() => removeMethod(i)} aria-label={`Remove ${m}`} className="text-gray-400 hover:text-red-600">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={methodInput}
              onChange={(e) => setMethodInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addMethod()
                }
              }}
              placeholder="Add a method"
              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <button
              type="button"
              onClick={addMethod}
              className="px-2 py-1.5 text-xs font-medium text-primary-700 border border-primary-600 rounded-lg hover:bg-primary-50 inline-flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Customer is providing</label>
          <textarea
            value={form.customer_provides}
            onChange={(e) => update('customer_provides', e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
      </div>
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 mb-0.5">{label}</dt>
      <dd className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{value}</dd>
    </div>
  )
}
