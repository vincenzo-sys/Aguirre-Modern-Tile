'use client'

// Shared button with a built-in busy state and a 44px minimum touch target
// (Apple's HIG minimum — the dashboard is used one-handed in the field). When
// `loading` is true it shows a spinner, disables itself, and keeps its width
// stable so the layout doesn't jump.

import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700',
  secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'text-gray-600 hover:bg-gray-100',
}

export default function Button({
  variant = 'primary',
  loading = false,
  loadingLabel,
  icon,
  children,
  className = '',
  disabled,
  ...rest
}: {
  variant?: Variant
  loading?: boolean
  loadingLabel?: string
  icon?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-lg text-sm font-semibold transition-colors active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${VARIANTS[variant]} ${className}`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  )
}
