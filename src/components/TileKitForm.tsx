'use client'

import { useState } from 'react'
import { Check, Loader2, ArrowLeft, ArrowRight, Lock } from 'lucide-react'
import { toast } from '@/components/Toast'
import { validateContact } from '@/lib/validation'
import {
  TILE_KIT,
  KIT_ROOMS,
  KIT_STYLES,
  KIT_BUDGETS,
  KIT_TIMELINES,
  KIT_SERVICE_TOWNS,
} from '@/data/tileKit'

const MAX_STYLES = 3

/**
 * Two steps on purpose. Every extra step is a drop-off point, and the only
 * fields that genuinely have to be collected before payment are the ones
 * needed to pull the right samples and physically deliver them.
 */
export default function TileKitForm() {
  const [step, setStep] = useState(1)
  const [styles, setStyles] = useState<string[]>([])
  const [room, setRoom] = useState('')
  const [budget, setBudget] = useState('')
  const [timeline, setTimeline] = useState('')
  const [squareFeet, setSquareFeet] = useState('')
  const [town, setTown] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [contact, setContact] = useState({ name: '', email: '', phone: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const toggleStyle = (value: string) => {
    setStyles((prev) => {
      if (prev.includes(value)) return prev.filter((s) => s !== value)
      if (prev.length >= MAX_STYLES) {
        toast(`Pick up to ${MAX_STYLES} looks — we'll mix within them.`, 'warning')
        return prev
      }
      return [...prev, value]
    })
  }

  const goToStep2 = () => {
    if (styles.length === 0) {
      toast('Pick at least one look so we know what to pull.', 'warning')
      return
    }
    if (!room) {
      toast('Which room is this for?', 'warning')
      return
    }
    setStep(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors = validateContact(contact, { requireEmail: true })
    if (Object.keys(errors).length > 0) {
      toast(Object.values(errors)[0] || 'Please check your contact details.', 'warning')
      return
    }
    if (!town) {
      toast('Pick your town so we can plan the drop-off.', 'warning')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/tile-kit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...contact,
          styles,
          room,
          budget,
          timeline,
          squareFeet,
          town,
          address,
          notes,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.url) {
        toast(data.error || 'Something went wrong. Please try again.', 'error')
        setIsSubmitting(false)
        return
      }

      // Stripe Checkout (or the local-dev thank-you fallback).
      window.location.href = data.url
    } catch {
      toast('Network error — please try again.', 'error')
      setIsSubmitting(false)
    }
  }

  return (
    <div id="kit-form" className="scroll-mt-20 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="text-sm font-semibold text-primary-700">Step {step} of 2</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-primary-600 transition-all duration-300"
            style={{ width: step === 1 ? '50%' : '100%' }}
          />
        </div>
      </div>

      {step === 1 ? (
        <div>
          <h3 className="text-xl font-bold text-gray-900">Pick your look</h3>
          <p className="mt-1 text-sm text-gray-600">
            Choose up to {MAX_STYLES}. We pull {TILE_KIT.sampleCount} real samples across what you
            pick.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {KIT_STYLES.map((style) => {
              const selected = styles.includes(style.value)
              return (
                <button
                  key={style.value}
                  type="button"
                  onClick={() => toggleStyle(style.value)}
                  aria-pressed={selected}
                  className={`rounded-xl border-2 p-4 text-left transition ${
                    selected
                      ? 'border-primary-600 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900">{style.label}</span>
                    {selected && <Check className="h-5 w-5 shrink-0 text-primary-600" />}
                  </span>
                  <span className="mt-1 block text-sm text-gray-600">{style.blurb}</span>
                </button>
              )
            })}
          </div>

          <fieldset className="mt-7">
            <legend className="text-sm font-semibold text-gray-900">
              What are you tiling?
            </legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {KIT_ROOMS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRoom(r.value)}
                  aria-pressed={room === r.value}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    room === r.value
                      ? 'border-primary-600 bg-primary-600 text-white'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            onClick={goToStep2}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-6 py-4 text-lg font-semibold text-white transition hover:bg-primary-700"
          >
            Continue
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <h3 className="text-xl font-bold text-gray-900">Where should we drop it?</h3>
          <p className="mt-1 text-sm text-gray-600">
            Kits are hand-delivered inside our service area — no shipping wait.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="kit-name" className="mb-1 block text-sm font-medium text-gray-700">
                Name *
              </label>
              <input
                id="kit-name"
                type="text"
                required
                value={contact.name}
                onChange={(e) => setContact({ ...contact, name: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </div>

            <div>
              <label htmlFor="kit-email" className="mb-1 block text-sm font-medium text-gray-700">
                Email *
              </label>
              <input
                id="kit-email"
                type="email"
                required
                value={contact.email}
                onChange={(e) => setContact({ ...contact, email: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </div>

            <div>
              <label htmlFor="kit-phone" className="mb-1 block text-sm font-medium text-gray-700">
                Phone *
              </label>
              <input
                id="kit-phone"
                type="tel"
                required
                value={contact.phone}
                onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </div>

            <div>
              <label htmlFor="kit-town" className="mb-1 block text-sm font-medium text-gray-700">
                Town *
              </label>
              <select
                id="kit-town"
                required
                value={town}
                onChange={(e) => setTown(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              >
                <option value="">Select your town</option>
                {KIT_SERVICE_TOWNS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="kit-sqft" className="mb-1 block text-sm font-medium text-gray-700">
                Rough size (sq ft)
              </label>
              <input
                id="kit-sqft"
                type="text"
                inputMode="numeric"
                placeholder="e.g. 60 — a guess is fine"
                value={squareFeet}
                onChange={(e) => setSquareFeet(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="kit-address" className="mb-1 block text-sm font-medium text-gray-700">
                Street address
              </label>
              <input
                id="kit-address"
                type="text"
                placeholder="Where we leave the kit"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </div>

            <div>
              <label htmlFor="kit-budget" className="mb-1 block text-sm font-medium text-gray-700">
                Material budget
              </label>
              <select
                id="kit-budget"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              >
                <option value="">No preference</option>
                {KIT_BUDGETS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="kit-timeline"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                When do you want it done?
              </label>
              <select
                id="kit-timeline"
                value={timeline}
                onChange={(e) => setTimeline(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              >
                <option value="">Not sure</option>
                {KIT_TIMELINES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="kit-notes" className="mb-1 block text-sm font-medium text-gray-700">
                Anything else? (optional)
              </label>
              <textarea
                id="kit-notes"
                rows={3}
                placeholder="Colors you love or hate, existing fixtures, a Pinterest link…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-7 flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-6 py-4 text-lg font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Taking you to checkout…
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" />
                Get my kit — ${TILE_KIT.price}
              </>
            )}
          </button>

          <p className="mt-3 text-center text-sm text-gray-500">
            ${TILE_KIT.installCredit} comes back as install credit. Secure checkout by Stripe.
          </p>
        </form>
      )}
    </div>
  )
}
