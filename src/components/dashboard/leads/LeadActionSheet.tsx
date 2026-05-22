'use client'

// Shared bottom sheet used by the leads page for actions that need a
// surface bigger than a popover: scheduling a visit, sharing an estimate
// link, picking a follow-up date. Mirrors the overlay/backdrop/dismiss
// pattern from JobMobileActionBar.tsx, but stays visible on desktop too
// (so the leads admin workflow works at any size).

import { useState, useEffect, useRef } from 'react'
import { X, Loader2, Copy, ExternalLink, MessageSquare, Check } from 'lucide-react'
import { toast } from '@/components/Toast'

type ScheduleVisitMode = {
  mode: 'schedule-visit'
  initialAt: string | null
  initialNotes: string | null
  customerName: string
  onSave: (isoAt: string, notes: string | null) => Promise<void>
}

type ShareEstimateMode = {
  mode: 'share-estimate'
  url: string
  customerName: string
  customerPhone: string | null
}

type PickFollowupMode = {
  mode: 'pick-followup'
  initialDate: string | null  // YYYY-MM-DD
  onSave: (date: string | null) => Promise<void>
}

export type LeadActionSheetProps =
  | ({ open: boolean; onClose: () => void } & ScheduleVisitMode)
  | ({ open: boolean; onClose: () => void } & ShareEstimateMode)
  | ({ open: boolean; onClose: () => void } & PickFollowupMode)

export default function LeadActionSheet(props: LeadActionSheetProps) {
  // Hooks must run only when the sheet is actually mounted on screen;
  // delegating to a child component that runs them on every mount/unmount
  // keeps the open/close lifecycle clean.
  if (!props.open) return null
  return <SheetShell {...props} />
}

function SheetShell(props: LeadActionSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  // B4: focus management.
  // On open: remember the element that had focus (so we can return on
  // close), then focus the first focusable inside the dialog.
  // While open: Esc closes; Tab/Shift+Tab cycle focus within the dialog.
  // On close: focus the trigger element if it's still in the DOM.
  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement | null

    // Prefer the input opted-in via data-autofocus (the form's primary
    // input), so we don't land on the close ✕ button.
    const preferred = dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')
    const fallback = dialogRef.current?.querySelector<HTMLElement>(
      'input:not([disabled]), textarea:not([disabled])',
    )
    ;(preferred ?? fallback)?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); props.onClose(); return }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'input, textarea, button, a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Restore focus only if the trigger is still mounted (it may have
      // been removed if the sheet's action unmounted it).
      const t = triggerRef.current
      if (t && document.contains(t)) t.focus()
    }
  }, [props.onClose])

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 animate-in fade-in"
        onClick={props.onClose}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl pb-[env(safe-area-inset-bottom)] max-h-[85vh] overflow-y-auto md:max-w-lg md:mx-auto md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:bottom-8 md:rounded-2xl"
      >
        <SheetHeader title={titleFor(props)} onClose={props.onClose} />
        <div className="px-4 pb-5 pt-3">
          {props.mode === 'schedule-visit' && <ScheduleVisitForm {...props} />}
          {props.mode === 'share-estimate' && <ShareEstimateBody {...props} />}
          {props.mode === 'pick-followup' && <PickFollowupForm {...props} />}
        </div>
      </div>
    </>
  )
}

function titleFor(p: LeadActionSheetProps): string {
  switch (p.mode) {
    case 'schedule-visit': return 'Schedule site visit'
    case 'share-estimate': return 'Share estimate link'
    case 'pick-followup': return 'Set next follow-up'
  }
}

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="p-1 text-gray-400 hover:text-gray-600"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  )
}

// ── Schedule visit ─────────────────────────────────────────────────────

function ScheduleVisitForm(p: ScheduleVisitMode & { onClose: () => void }) {
  // datetime-local needs `YYYY-MM-DDTHH:MM`; seed from existing ISO if any.
  const [at, setAt] = useState(() => isoToLocalInput(p.initialAt))
  const [notes, setNotes] = useState(p.initialNotes ?? '')
  const [saving, setSaving] = useState(false)
  // Auto-focus is handled by SheetShell via the data-autofocus attribute
  // on the datetime input below.

  async function save() {
    if (!at) { toast('Pick a date and time first', 'error'); return }
    setSaving(true)
    try {
      // datetime-local gives us local-tz; convert to UTC ISO for the API.
      const isoAt = new Date(at).toISOString()
      await p.onSave(isoAt, notes.trim() || null)
      toast('Visit scheduled', 'success')
      p.onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Estimate visit with <strong>{p.customerName}</strong>.
      </p>
      <label className="block">
        <span className="block text-xs font-medium text-gray-700 mb-1">When</span>
        <input
          data-autofocus
          type="datetime-local"
          value={at}
          onChange={(e) => setAt(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Gate code, parking, what to bring…"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
        />
      </label>
      <button
        type="button"
        onClick={save}
        disabled={saving || !at}
        className="w-full inline-flex items-center justify-center gap-2 bg-primary-600 text-white rounded-lg py-3 font-semibold text-sm active:scale-95 transition disabled:opacity-60 min-h-[44px]"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Save visit
      </button>
    </div>
  )
}

// ── Share estimate link ────────────────────────────────────────────────

function ShareEstimateBody(p: ShareEstimateMode & { onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(p.url)
      setCopied(true)
      toast('Link copied to clipboard', 'success')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Could not copy — long-press the field to copy manually', 'error')
    }
  }

  const smsBody = `Hi ${firstName(p.customerName)} — here's your estimate from Aguirre Modern Tile: ${p.url}`
  const smsHref = p.customerPhone
    ? `sms:${normalizePhoneForSms(p.customerPhone)}?&body=${encodeURIComponent(smsBody)}`
    : null

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Estimate ready for <strong>{p.customerName}</strong>. Pick how you want to share.
      </p>
      <label className="block">
        <span className="block text-xs font-medium text-gray-700 mb-1">Public link</span>
        <input
          data-autofocus
          readOnly
          value={p.url}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium border-2 border-gray-200 rounded-lg active:scale-95 transition"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <a
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium border-2 border-gray-200 rounded-lg active:scale-95 transition"
        >
          <ExternalLink className="w-4 h-4" />
          Preview
        </a>
      </div>
      {smsHref ? (
        <a
          href={smsHref}
          className="w-full inline-flex items-center justify-center gap-2 bg-primary-600 text-white rounded-lg py-3 font-semibold text-sm active:scale-95 transition min-h-[44px]"
        >
          <MessageSquare className="w-4 h-4" />
          Text it to {firstName(p.customerName)}
        </a>
      ) : (
        <p className="text-xs text-gray-500 italic text-center">
          No phone on file — copy the link to share another way.
        </p>
      )}
      <p className="text-[11px] text-gray-400 text-center">
        Job auto-flips to <strong>Quoted</strong> the first time you generate this link.
      </p>
    </div>
  )
}

// ── Pick follow-up ─────────────────────────────────────────────────────

function PickFollowupForm(p: PickFollowupMode & { onClose: () => void }) {
  const [date, setDate] = useState(p.initialDate ?? '')
  const [saving, setSaving] = useState(false)

  async function save(d: string | null) {
    setSaving(true)
    try {
      await p.onSave(d)
      toast(d ? `Follow-up set for ${d}` : 'Follow-up cleared', 'success')
      p.onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  function quick(days: number) {
    const d = new Date()
    d.setDate(d.getDate() + days)
    const iso = d.toISOString().slice(0, 10)
    setDate(iso)
    save(iso)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">When do you want to be reminded to follow up?</p>
      <div className="grid grid-cols-3 gap-2">
        {[3, 7, 14].map((n, i) => (
          <button
            key={n}
            type="button"
            disabled={saving}
            onClick={() => quick(n)}
            data-autofocus={i === 1 ? '' : undefined}
            className="px-3 py-2.5 text-sm font-medium border-2 border-gray-200 rounded-lg active:scale-95 transition disabled:opacity-60"
          >
            +{n} days
          </button>
        ))}
      </div>
      <label className="block">
        <span className="block text-xs font-medium text-gray-700 mb-1">Custom date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => save(date || null)}
          disabled={saving}
          className="flex-1 inline-flex items-center justify-center gap-2 bg-primary-600 text-white rounded-lg py-3 font-semibold text-sm active:scale-95 transition disabled:opacity-60 min-h-[44px]"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save
        </button>
        {p.initialDate && (
          <button
            type="button"
            onClick={() => save(null)}
            disabled={saving}
            className="px-4 py-3 text-sm font-medium text-gray-700 border-2 border-gray-200 rounded-lg active:scale-95 transition disabled:opacity-60"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

// ── helpers ────────────────────────────────────────────────────────────

function isoToLocalInput(iso: string | null): string {
  // datetime-local input wants YYYY-MM-DDTHH:MM in LOCAL time, no timezone.
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function firstName(full: string): string {
  return (full?.trim().split(/\s+/)[0]) || 'there'
}

function normalizePhoneForSms(phone: string): string {
  // sms: URIs are happiest with digits only (or +E.164). Strip everything else.
  const digits = phone.replace(/[^\d+]/g, '')
  return digits
}
