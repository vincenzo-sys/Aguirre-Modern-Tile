'use client'

// LeadMoreSheet — bottom sheet (mobile) / centered modal (desktop) that
// hosts the lead card's overflow actions. Replaces the old absolute-
// positioned dropdown that, on phone, covered the card's own content
// and got cut off below the viewport on lower cards. Mirrors
// StagePickerSheet's container so the leads page has a consistent
// mobile-modal language.
//
// Each action is either a button (fires onSelect + closes) or a link
// (renders an <a> so middle-click / cmd-click still work).

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type LeadMoreAction = {
  key: string
  icon: LucideIcon
  label: string
  // Optional second-line copy under the label.
  hint?: string
  // When true the row is tinted red — used for Archive (lost).
  danger?: boolean
  // When true a thin divider is drawn ABOVE this row. Use for the visual
  // separation between primary actions and Archive / Customer accepted.
  dividerBefore?: boolean
  // Mutually exclusive with onSelect: if href is set the row renders as
  // a Next.js Link so the browser handles native open-in-new-tab.
  href?: string
  onSelect?: () => void | Promise<void>
}

type Props = {
  open: boolean
  onClose: () => void
  title: string
  actions: LeadMoreAction[]
}

export default function LeadMoreSheet(props: Props) {
  if (!props.open) return null
  return <SheetBody {...props} />
}

function SheetBody({ onClose, title, actions }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    // Focus the first interactive row so keyboard users can Enter immediately.
    const first = dialogRef.current?.querySelector<HTMLElement>('[data-row="true"]')
    first?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 truncate pr-3">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-100 shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="py-1">
          {actions.map((a) => {
            const Icon = a.icon
            const rowClass = `w-full text-left px-5 py-3 flex items-start gap-3 border-b border-gray-100 last:border-b-0 transition-colors min-h-[56px] ${
              a.danger
                ? 'hover:bg-red-50 active:bg-red-100'
                : 'hover:bg-primary-50/50 active:bg-primary-100'
            }`
            const chipClass = `inline-flex items-center justify-center w-9 h-9 rounded-full shrink-0 ${
              a.danger ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
            }`
            const labelClass = `font-medium ${a.danger ? 'text-red-700' : 'text-gray-900'}`

            const body = (
              <>
                <span className={chipClass}>
                  <Icon className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className={labelClass}>{a.label}</div>
                  {a.hint && <p className="text-xs text-gray-500 mt-0.5">{a.hint}</p>}
                </div>
              </>
            )

            return (
              <div key={a.key}>
                {a.dividerBefore && <div className="border-t border-gray-200 my-1" />}
                {a.href ? (
                  <Link
                    href={a.href}
                    data-row="true"
                    onClick={() => onClose()}
                    className={rowClass}
                  >
                    {body}
                  </Link>
                ) : (
                  <button
                    type="button"
                    data-row="true"
                    onClick={async () => {
                      await a.onSelect?.()
                      onClose()
                    }}
                    className={rowClass}
                  >
                    {body}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
