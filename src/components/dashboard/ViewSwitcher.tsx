'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { List, Columns3, Calendar, GanttChart } from 'lucide-react'

const views = [
  { key: 'list', label: 'List', icon: List },
  { key: 'kanban', label: 'Kanban', icon: Columns3 },
  { key: 'calendar', label: 'Calendar', icon: Calendar },
  { key: 'timeline', label: 'Timeline', icon: GanttChart },
] as const

export type ViewMode = (typeof views)[number]['key']

export default function ViewSwitcher() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const current = (searchParams.get('view') as ViewMode) || 'list'

  function setView(view: ViewMode) {
    const params = new URLSearchParams(searchParams.toString())
    if (view === 'list') {
      params.delete('view')
    } else {
      params.set('view', view)
    }
    const qs = params.toString()
    router.push(`/dashboard${qs ? `?${qs}` : ''}`)
  }

  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
      {views.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => setView(key)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            current === key
              ? 'bg-primary-100 text-primary-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
          }`}
        >
          <Icon className="w-4 h-4" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}
