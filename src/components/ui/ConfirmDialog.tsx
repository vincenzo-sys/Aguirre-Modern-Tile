'use client'

// Promise-returning confirm dialog, mirroring the toast() singleton pattern so
// it can be called from anywhere — including non-component hooks and plain
// async functions — without prop-drilling a context. Replaces native confirm(),
// which on a phone blocks the page and hides the context behind it.
//
// Usage:
//   if (!(await confirmDialog({ title: 'Void invoice?', message: '…', tone: 'danger' }))) return
//
// Mount <ConfirmDialogHost /> once (in the root layout, beside <ToastContainer/>).

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

export type ConfirmOptions = {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

let openFn: ((opts: ConfirmOptions) => Promise<boolean>) | null = null

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (openFn) return openFn(opts)
  // Fallback to native confirm if the host isn't mounted (SSR/edge cases).
  if (typeof window !== 'undefined') {
    return Promise.resolve(window.confirm(opts.message || opts.title))
  }
  return Promise.resolve(false)
}

export default function ConfirmDialogHost() {
  const [pending, setPending] = useState<Pending | null>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    openFn = (opts) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...opts, resolve })
      })
    return () => { openFn = null }
  }, [])

  useEffect(() => {
    if (!pending) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); finish(false) }
    }
    document.addEventListener('keydown', onKey)
    confirmRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  function finish(ok: boolean) {
    pending?.resolve(ok)
    setPending(null)
  }

  if (!pending) return null

  const danger = pending.tone === 'danger'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={pending.title}
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4 animate-toast-in"
      onClick={() => finish(false)}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex items-start gap-3">
            {danger && (
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-red-100 text-red-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </span>
            )}
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-gray-900">{pending.title}</h3>
              {pending.message && (
                <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{pending.message}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={() => finish(false)}
            className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
          >
            {pending.cancelLabel || 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => finish(true)}
            className={`inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-lg text-sm font-semibold text-white ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {pending.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
