'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, MessageSquare, Loader2 } from 'lucide-react'
import { toast } from '@/components/Toast'

export default function CrewLog({
  jobId,
  initialLog,
  authorName,
}: {
  jobId: string
  initialLog: string | null
  authorName: string
}) {
  const router = useRouter()
  const [log, setLog] = useState<string>(initialLog ?? '')
  const [entry, setEntry] = useState('')
  const [saving, setSaving] = useState(false)

  async function addEntry() {
    const text = entry.trim()
    if (!text) return
    setSaving(true)

    const stamp = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    const newLine = `[${stamp} — ${authorName}] ${text}`
    const updated = log ? `${newLine}\n${log}` : newLine

    const previous = log
    setLog(updated)
    setEntry('')

    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crew_log: updated }),
      })
      if (!res.ok) throw new Error('Failed')
      toast('Entry added')
      router.refresh()
    } catch {
      setLog(previous)
      setEntry(text)
      toast('Could not save entry', 'error')
    } finally {
      setSaving(false)
    }
  }

  const entries = log ? log.split('\n').filter((l) => l.trim()) : []

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">Field log</h3>
        <span className="text-xs text-gray-400">
          Use this for extra purchases, surprises on site, scope changes.
        </span>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !saving) addEntry()
          }}
          placeholder="Bought extra bag of thinset $25 HD..."
          disabled={saving}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button
          type="button"
          onClick={addEntry}
          disabled={saving || !entry.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No entries yet.</p>
      ) : (
        <ul className="space-y-1.5 max-h-80 overflow-y-auto">
          {entries.map((line, i) => (
            <li
              key={i}
              className="text-sm text-gray-700 font-mono bg-gray-50 px-3 py-2 rounded border border-gray-100 whitespace-pre-wrap break-words"
            >
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
