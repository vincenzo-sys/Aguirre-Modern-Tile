'use client'

import { useState, useRef, useEffect } from 'react'
import { Loader2, Check } from 'lucide-react'
import { toast } from '@/components/Toast'

// Notion-style inline-editable cells used by the leads pipeline table.
// Each cell is its own micro-form: click → edit → autosave on blur or Enter.
// Saves are optimistic (UI updates immediately) with rollback + toast on
// failure. Uses fetch directly so the parent table doesn't need to know how
// any given cell persists.

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

function useSaveStatus() {
  const [status, setStatus] = useState<SaveStatus>('idle')
  function flash(s: SaveStatus, ms = 1200) {
    setStatus(s)
    if (s === 'saved' || s === 'error') {
      setTimeout(() => setStatus('idle'), ms)
    }
  }
  return [status, setStatus, flash] as const
}

// ────────────────────────────────────────────────────────────────────────
// Editable date cell — for last_contact_at / next_follow_up
// ────────────────────────────────────────────────────────────────────────

export function EditableDateCell({
  value,
  onSave,
  placeholder = '—',
  highlight = false,
  disabled = false,
}: {
  value: string | null  // ISO date string, e.g. "2026-04-22"
  onSave: (newValue: string | null) => Promise<void>
  placeholder?: string
  highlight?: boolean   // e.g. red text for overdue dates
  disabled?: boolean    // for jobs without a linked QR
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [, setStatus, flash] = useSaveStatus()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value ?? '') }, [value])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.showPicker?.()
    }
  }, [editing])

  async function commit(newVal: string | null) {
    setEditing(false)
    if (newVal === (value ?? null) || (newVal === '' && value === null)) return
    setStatus('saving')
    try {
      await onSave(newVal === '' ? null : newVal)
      flash('saved')
    } catch (err) {
      flash('error', 2000)
      toast(err instanceof Error ? err.message : 'Save failed', 'error')
      setDraft(value ?? '')
    }
  }

  if (disabled) {
    return <span className="text-gray-300">{placeholder}</span>
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(draft)
          if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
        }}
        className="w-full px-1 py-0.5 text-xs border border-primary-400 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setEditing(true) }}
      className={`inline-block min-w-[60px] text-left px-1 py-0.5 -mx-1 rounded hover:bg-gray-100 ${
        highlight ? 'text-red-600 font-medium' : value ? 'text-gray-700' : 'text-gray-300'
      }`}
      title="Click to edit"
    >
      {value ? formatDateShort(value) : placeholder}
    </button>
  )
}

function formatDateShort(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ────────────────────────────────────────────────────────────────────────
// Editable notes cell — multi-line, expands on click
// ────────────────────────────────────────────────────────────────────────

export function EditableNotesCell({
  value,
  onSave,
  placeholder = 'Brainstorm…',
}: {
  value: string | null
  onSave: (newValue: string | null) => Promise<void>
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [status, setStatus, flash] = useSaveStatus()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setDraft(value ?? '') }, [value])

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length)
    }
  }, [editing])

  async function commit() {
    setEditing(false)
    const next = draft.trim() === '' ? null : draft
    if (next === (value ?? null)) return
    setStatus('saving')
    try {
      await onSave(next)
      flash('saved')
    } catch (err) {
      flash('error', 2000)
      toast(err instanceof Error ? err.message : 'Save failed', 'error')
      setDraft(value ?? '')
    }
  }

  if (editing) {
    return (
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
            // Cmd/Ctrl+Enter saves; plain Enter just adds a newline (Notion-style)
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit()
          }}
          rows={Math.min(8, Math.max(3, draft.split('\n').length))}
          placeholder={placeholder}
          className="w-full min-w-[260px] px-2 py-1 text-xs border border-primary-400 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 resize-y"
        />
        <p className="text-[10px] text-gray-400 mt-0.5">Cmd/Ctrl+Enter to save · Esc to cancel</p>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setEditing(true) }}
      className="block w-full text-left px-1 py-0.5 -mx-1 rounded hover:bg-gray-100 group"
      title="Click to edit"
    >
      {value ? (
        <span className="text-xs text-gray-700 line-clamp-2 whitespace-pre-wrap">{value}</span>
      ) : (
        <span className="text-xs text-gray-300 italic group-hover:text-gray-400">{placeholder}</span>
      )}
      {status === 'saving' && <Loader2 className="w-3 h-3 inline ml-1 animate-spin text-gray-400" />}
      {status === 'saved' && <Check className="w-3 h-3 inline ml-1 text-emerald-500" />}
    </button>
  )
}
