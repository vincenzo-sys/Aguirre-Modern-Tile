'use client'

import { useEffect, useState } from 'react'

// Small autocomplete picker using native <datalist>. Fetches the customer
// list once and filters client-side — fine for Aguirre's scale (low
// hundreds). If this ever slows down, switch to a debounced /api/customers?q=.

type CustomerOption = { id: string; name: string }

export default function ReferrerPicker({
  value,
  onChange,
  excludeId,
  placeholder = 'Start typing a customer name',
}: {
  value: string | null
  onChange: (customerId: string | null) => void
  excludeId?: string
  placeholder?: string
}) {
  const [options, setOptions] = useState<CustomerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/customers')
      .then((r) => r.json())
      .then((data: CustomerOption[]) => {
        if (cancelled) return
        const list = Array.isArray(data)
          ? data.filter((c) => c && c.id && c.name && c.id !== excludeId)
          : []
        setOptions(list)
        // If we were given an existing value, show its name in the input
        if (value) {
          const existing = list.find((c) => c.id === value)
          if (existing) setText(existing.name)
        }
      })
      .catch(() => { /* no-op */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [value, excludeId])

  function handleTextChange(next: string) {
    setText(next)
    if (!next.trim()) {
      onChange(null)
      return
    }
    // Resolve to an ID only when it's an exact match to a known customer
    const match = options.find(
      (c) => c.name.toLowerCase().trim() === next.toLowerCase().trim()
    )
    onChange(match?.id ?? null)
  }

  return (
    <>
      <input
        type="text"
        list="referrer-picker-list"
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        disabled={loading}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-60"
        placeholder={loading ? 'Loading customers…' : placeholder}
      />
      <datalist id="referrer-picker-list">
        {options.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
    </>
  )
}
