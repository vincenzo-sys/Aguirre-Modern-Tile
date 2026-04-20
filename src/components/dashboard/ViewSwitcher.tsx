'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { LayoutGrid, Calendar, GanttChart } from 'lucide-react'

const views = [
  { key: 'cards', label: 'Cards', icon: LayoutGrid },
  { key: 'calendar', label: 'Calendar', icon: Calendar },
  { key: 'timeline', label: 'Timeline', icon: GanttChart },
] as const

export type ViewMode = (typeof views)[number]['key']

export default function ViewSwitcher({ prominent = false }: { prominent?: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const current = (searchParams.get('view') as ViewMode) || 'cards'

  function setView(view: ViewMode) {
    const params = new URLSearchParams(searchParams.toString())
    if (view === 'cards') {
      params.delete('view')
    } else {
      params.set('view', view)
    }
    const qs = params.toString()
    router.push(`/dashboard/jobs${qs ? `?${qs}` : ''}`)
  }

  if (prominent) {
    return (
      <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1.5 w-fit">
        {views.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-base font-semibold transition-colors ${
              current === key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        ))}
      </div>
    )
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
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}
