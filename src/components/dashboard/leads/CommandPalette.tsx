'use client'

// Cmd-K / Ctrl-K command palette for the leads pipeline. Fuzzy-search
// across customer name, project name, and phone digits; arrow keys to
// navigate, Enter to open the lead, hover actions for "Mark contacted"
// and "Follow up +7d". Mobile triggers via a search icon in the page
// header (no Cmd-K combo on touch).
//
// No `cmdk` library — a 20-line score function + native keyboard
// handling is enough for ~25-100 items.

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ArrowRight, Clock, CalendarPlus } from 'lucide-react'
import type { PipelineItem } from '@/app/api/pipeline/route'

// Substring + initials scoring. Higher = better. 0 = no match.
function score(query: string, target: string | null | undefined): number {
  if (!target) return 0
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (t === q) return 100
  if (t.startsWith(q)) return 80
  if (t.includes(q)) return 60
  const initials = target.split(/\s+/).map((w) => w[0]?.toLowerCase() ?? '').join('')
  if (initials.startsWith(q)) return 50
  return 0
}

function scoreItem(query: string, item: PipelineItem): number {
  const trimmed = query.trim()
  if (!trimmed) return 0
  const nameScore = score(trimmed, item.client_name)
  const projectScore = score(trimmed, item.project_name) * 0.9 // names slightly preferred
  const phone = item.client_phone?.replace(/\D/g, '') ?? ''
  const qDigits = trimmed.replace(/\D/g, '')
  const phoneScore = qDigits.length >= 3 && phone.includes(qDigits)
    ? (phone.endsWith(qDigits) ? 70 : 40)
    : 0
  return Math.max(nameScore, projectScore, phoneScore)
}

export default function CommandPalette({
  open, onClose, items, onMarkContacted, onPickFollowupQuick,
}: {
  open: boolean
  onClose: () => void
  items: PipelineItem[]
  onMarkContacted: (item: PipelineItem) => Promise<void> | void
  onPickFollowupQuick: (item: PipelineItem) => Promise<void> | void
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset on open. Auto-focus input.
  useEffect(() => {
    if (open) {
      setQuery('')
      setFocusedIdx(0)
      // microtask to outrun the keydown that opened us (otherwise Enter
      // / k can re-fire on the input).
      queueMicrotask(() => inputRef.current?.focus())
    }
  }, [open])

  // Scored + sorted results. Empty query shows the most-urgent 8 items.
  const results = useMemo(() => {
    if (!query.trim()) {
      return [...items].sort((a, b) => b.urgency - a.urgency).slice(0, 8)
    }
    return items
      .map((item) => ({ item, s: scoreItem(query, item) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((r) => r.item)
  }, [items, query])

  if (!open) return null

  function navigate(item: PipelineItem) {
    onClose()
    router.push(`/dashboard/leads/${item.id}`)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx((i) => Math.min(i + 1, results.length - 1)); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusedIdx((i) => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter')     {
      e.preventDefault()
      const r = results[focusedIdx]
      if (r) navigate(r)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed left-1/2 top-[15vh] -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-lg bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
      >
        {/* Input row */}
        <div className="border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setFocusedIdx(0) }}
            onKeyDown={handleKeyDown}
            placeholder="Find a lead by name, project, or phone…"
            className="flex-1 outline-none text-sm bg-transparent placeholder:text-gray-400"
          />
          <kbd className="text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[55vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-sm text-center text-gray-400">No matches</div>
          ) : (
            results.map((item, i) => (
              <ResultRow
                key={`${item.kind}-${item.id}`}
                item={item}
                focused={i === focusedIdx}
                onSelect={() => navigate(item)}
                onMarkContacted={async () => { await onMarkContacted(item); onClose() }}
                onPickFollowupQuick={async () => { await onPickFollowupQuick(item); onClose() }}
                onMouseEnter={() => setFocusedIdx(i)}
              />
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="border-t border-gray-100 px-4 py-2 flex items-center gap-3 text-[10px] text-gray-500">
          <span><kbd className="border border-gray-200 rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="border border-gray-200 rounded px-1">↵</kbd> open</span>
          <span className="ml-auto">{results.length} result{results.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </>
  )
}

function ResultRow({
  item, focused, onSelect, onMarkContacted, onPickFollowupQuick, onMouseEnter,
}: {
  item: PipelineItem
  focused: boolean
  onSelect: () => void
  onMarkContacted: () => void
  onPickFollowupQuick: () => void
  onMouseEnter: () => void
}) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${focused ? 'bg-primary-50' : 'hover:bg-gray-50'}`}
      onClick={onSelect}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{item.client_name}</div>
        <div className="text-xs text-gray-500 truncate">
          {item.project_name}
          {item.client_phone && <span className="text-gray-400"> · {item.client_phone}</span>}
        </div>
      </div>
      {focused && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <ActionButton icon={Clock} label="Contacted" onClick={(e) => { e.stopPropagation(); onMarkContacted() }} />
          <ActionButton icon={CalendarPlus} label="+7d" onClick={(e) => { e.stopPropagation(); onPickFollowupQuick() }} />
          <ArrowRight className="w-3.5 h-3.5 text-gray-400 ml-1" />
        </div>
      )}
    </div>
  )
}

function ActionButton({
  icon: Icon, label, onClick,
}: {
  icon: typeof Clock
  label: string
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-700 bg-white border border-gray-200 rounded hover:bg-gray-50"
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  )
}
