'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Columns3, Calendar } from 'lucide-react'

const views = [
  { key: 'kanban', label: 'Board', icon: Columns3 },
  { key: 'calendar', label: 'Calendar', icon: Calendar },
] as const

export type ViewMode = (typeof views)[number]['key']

export default function ViewSwitcher() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const current = (searchParams.get('view') as ViewMode) || 'kanban'

  function setView(view: ViewMode) {
    const params = new URLSearchParams(searchParams.toString())
    if (view === 'kanban') {
      params.delete('view')
    } else {
      params.set('view', view)
    }
    const qs = params.toString()
    router.push(`/dashboard/jobs${qs ? `?${qs}` : ''}`)
  }

  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
      {views.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => setView(key)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            current === key
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Icon className="w-4 h-4" />
          {label}
        </button>
      ))}
    </div>
  )
}
