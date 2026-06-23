'use client'

import { Printer } from 'lucide-react'

// Triggers the browser's print dialog so the customer can "Save as PDF".
// Pairs with the @media print rules in globals.css (the .no-print class hides
// nav/buttons/sticky bars) to produce a clean, branded one-page document —
// no server-side PDF dependency required.
export default function PrintButton({
  label = 'Download PDF',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={
        className ??
        'inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-gray-700 border-2 border-gray-300 rounded-lg font-semibold text-sm hover:bg-gray-50 active:scale-95 transition'
      }
    >
      <Printer className="w-4 h-4" />
      {label}
    </button>
  )
}
