'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

// Optional inline action ("Undo", "Retry", etc.) rendered as a button
// next to the close (X). Clicking it fires `onClick` AND dismisses the
// toast. When an action is present, the auto-dismiss timer extends to
// 5s so the user has room to react. Without an action, stays at 4s.
type ToastAction = {
  label: string
  onClick: () => void
}

interface ToastMessage {
  id: number
  message: string
  type: ToastType
  action?: ToastAction
}

let addToastFn: ((message: string, type: ToastType, action?: ToastAction) => void) | null = null
let nextId = 0

export function toast(message: string, type: ToastType = 'info', action?: ToastAction) {
  if (addToastFn) {
    addToastFn(message, type, action)
  }
}

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />,
  error: <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />,
  info: <Info className="w-5 h-5 text-blue-500 flex-shrink-0" />,
}

const styles: Record<ToastType, string> = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-white border-gray-200 text-gray-800',
}

// Action button picks up the toast type's accent color so an Undo
// inside a success toast feels native (green), Retry inside an error
// reads red, etc.
const actionStyles: Record<ToastType, string> = {
  success: 'text-green-700 hover:bg-green-100',
  error: 'text-red-700 hover:bg-red-100',
  warning: 'text-amber-700 hover:bg-amber-100',
  info: 'text-blue-700 hover:bg-blue-100',
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((message: string, type: ToastType, action?: ToastAction) => {
    const id = nextId++
    setToasts(prev => [...prev, { id, message, type, action }])
    setTimeout(() => dismiss(id), action ? 5000 : 4000)
  }, [dismiss])

  useEffect(() => {
    addToastFn = addToast
    return () => { addToastFn = null }
  }, [addToast])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-start gap-3 rounded-lg p-4 shadow-lg border text-sm animate-toast-in ${styles[t.type]}`}
        >
          {icons[t.type]}
          <p className="flex-1">{t.message}</p>
          {t.action && (
            <button
              onClick={() => { t.action!.onClick(); dismiss(t.id) }}
              className={`flex-shrink-0 px-2 py-1 rounded font-semibold text-xs uppercase tracking-wide ${actionStyles[t.type]}`}
            >
              {t.action.label}
            </button>
          )}
          <button
            onClick={() => dismiss(t.id)}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
