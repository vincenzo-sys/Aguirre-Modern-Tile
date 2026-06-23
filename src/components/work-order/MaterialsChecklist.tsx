'use client'

import { useEffect, useState } from 'react'
import { Package, ExternalLink, Check, ChevronDown } from 'lucide-react'

export type Material = {
  description: string
  quantity: number
  unit: string
  status: 'needed' | 'ordered' | 'received' | 'on_site' | null
  source_url: string | null
  source_name: string | null
  section: string | null
}

// Material status → label + color. Mirrors the dashboard's MaterialStatus
// so the crew sees the same "is it here yet?" state the office tracks.
const STATUS_META: Record<NonNullable<Material['status']>, { label: string; cls: string }> = {
  needed: { label: 'Needed', cls: 'bg-gray-100 text-gray-600' },
  ordered: { label: 'Ordered', cls: 'bg-blue-100 text-blue-700' },
  received: { label: 'Received', cls: 'bg-amber-100 text-amber-700' },
  on_site: { label: 'On site', cls: 'bg-green-100 text-green-700' },
}

const PROJECTWIDE = 'Project-wide'

// Stable per-item key so a check survives reload and reorder. Section +
// description is unique enough for a materials list (the office doesn't list
// the same item twice in one section).
function itemKey(m: Material): string {
  return `${m.section || PROJECTWIDE}::${m.description}`
}

// Tap-to-check materials list. The crew checks items off as they load the
// truck; checks persist per-job in localStorage so closing the tab or
// reopening the link keeps their progress. Kept as a small client island so
// the rest of the work order page stays server-rendered.
export default function MaterialsChecklist({
  materials,
  token,
}: {
  materials: Material[]
  token: string
}) {
  const storageKey = `wo-checked-${token}`
  const collapseKey = `wo-materials-collapsed-${token}`
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [collapsed, setCollapsed] = useState(false)
  // Avoid a hydration flash: only reflect stored checks after mount.
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) setChecked(JSON.parse(raw) as Record<string, boolean>)
      setCollapsed(localStorage.getItem(collapseKey) === '1')
    } catch {
      // corrupt/unavailable storage — start fresh, no-op
    }
    setHydrated(true)
  }, [storageKey, collapseKey])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(collapseKey, next ? '1' : '0')
      } catch {
        // ignore storage failures
      }
      return next
    })
  }

  function toggle(key: string) {
    setChecked((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // storage full/blocked — keep the in-memory state anyway
      }
      return next
    })
  }

  if (materials.length === 0) return null

  // Group by section so multi-room jobs read room-by-room. Items with no
  // section fall under a single unlabeled bucket.
  const sectionMap = new Map<string, Material[]>()
  for (const m of materials) {
    const key = m.section || PROJECTWIDE
    if (!sectionMap.has(key)) sectionMap.set(key, [])
    sectionMap.get(key)!.push(m)
  }
  const sections = Array.from(sectionMap.entries())
  const showSectionHeaders = sections.length > 1 || sections[0]?.[0] !== PROJECTWIDE

  const doneCount = hydrated
    ? materials.filter((m) => checked[itemKey(m)]).length
    : 0

  return (
    <section id="materials" className="bg-white rounded-xl border border-gray-200 overflow-hidden scroll-mt-16">
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        className="w-full px-5 py-3 bg-gray-100 border-b border-gray-200 flex items-center gap-2 text-left"
      >
        <Package className="w-4 h-4 text-gray-600" />
        <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
          Materials ({materials.length})
        </h2>
        <span className="ml-auto text-xs font-medium text-gray-600 tabular-nums">
          {doneCount}/{materials.length} loaded
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
      </button>
      {!collapsed && sections.map(([sectionKey, items]) => (
        <div key={sectionKey}>
          {showSectionHeaders && (
            <div className="px-5 py-2 bg-primary-50 border-b border-primary-100">
              <span className="text-xs font-semibold text-primary-900 uppercase tracking-wider">
                {sectionKey}
              </span>
            </div>
          )}
          <ul className="divide-y divide-gray-100">
            {items.map((m, i) => {
              const key = itemKey(m)
              const isChecked = hydrated && !!checked[key]
              return (
                <li key={i}>
                  <div className="w-full px-5 py-3 min-h-[44px] flex items-start gap-3 text-left">
                    {/* The checkbox is the tap target; the source link stays a
                        separate tap so it isn't swallowed by the toggle. */}
                    <button
                      type="button"
                      onClick={() => toggle(key)}
                      aria-pressed={isChecked}
                      aria-label={`Mark ${m.description} as loaded`}
                      className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-md border-2 flex items-center justify-center transition-colors ${
                        isChecked
                          ? 'bg-green-600 border-green-600 text-white'
                          : 'bg-white border-gray-400 text-transparent'
                      }`}
                    >
                      <Check className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(key)}
                      className="min-w-0 flex-1 text-left min-h-[44px]"
                    >
                      <p
                        className={`text-[15px] ${
                          isChecked ? 'text-gray-400 line-through' : 'text-gray-900'
                        }`}
                      >
                        {m.description}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-600">
                          {m.quantity} {m.unit}
                        </span>
                      </div>
                    </button>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {m.status && (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_META[m.status].cls}`}
                        >
                          {STATUS_META[m.status].label}
                        </span>
                      )}
                      {m.source_url && (
                        <a
                          href={m.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-xs text-primary-600 hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {m.source_name || 'Source'}
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}
