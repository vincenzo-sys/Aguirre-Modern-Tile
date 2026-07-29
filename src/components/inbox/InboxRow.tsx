'use client'

import Link from 'next/link'
import { Globe, Phone, UserPlus } from 'lucide-react'
import type { InboxThread } from '@/lib/inbox'
import { STAGE_META, type PipelineStage } from '@/lib/leadStages'
import { formatTimeAgo, formatPhoneDisplay } from '@/components/dashboard/leads/formatters'

// One conversation row in the Inbox list. Follows LeadCard's layering
// pattern: a stretched link covers the row (z-10) and interactive children
// sit above it (z-20), so the whole row is tappable without nested-link bugs.
//
// Row destinations:
//   - phone threads         → /dashboard/inbox/[key] (the SMS+call timeline)
//   - website-only threads  → the lead workspace (there's no phone history
//     to show; tapping also marks the lead reviewed, clearing its unread)

// Stage values that aren't pipeline stages ('in_progress',
// 'waiting_for_materials') get a neutral chip with a prettified label.
function stageChip(stage: string): { label: string; className: string } {
  const meta = STAGE_META[stage as PipelineStage]
  if (meta) return { label: meta.label, className: meta.chip }
  const label = stage.replace(/_/g, ' ')
  return { label: label.charAt(0).toUpperCase() + label.slice(1), className: 'bg-gray-100 text-gray-700' }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

export default function InboxRow({ thread }: { thread: InboxThread }) {
  const websiteOnly = thread.channels.length === 1 && thread.channels[0] === 'website'
  const phoneForDisplay = thread.phone_e164 ?? thread.phone_raw ?? (websiteOnly ? null : thread.key)
  const name = thread.display_name ?? formatPhoneDisplay(phoneForDisplay) ?? ''
  const unread = thread.unread > 0
  // Unknown number with real phone history — offer the one-tap convert.
  const isUnknown = !thread.customer_id && !thread.lead && !websiteOnly

  const href =
    websiteOnly && thread.lead ? `/dashboard/leads/${thread.lead.id}` : `/dashboard/inbox/${thread.key}`

  // Website-only rows never hit the thread GET (which is what normally marks
  // things read), so stamp the lead reviewed on tap — fire-and-forget.
  const markReviewed = () => {
    if (websiteOnly && thread.lead && thread.unread > 0) {
      fetch(`/api/leads/${thread.lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'reviewed' }),
      }).catch(() => {})
    }
  }

  const chip = thread.lead ? stageChip(thread.lead.stage) : null

  return (
    <div className="relative flex items-center gap-3 px-4 py-3 bg-white active:bg-gray-50 transition-colors">
      <Link
        href={href}
        onClick={markReviewed}
        className="absolute inset-0 z-10"
        aria-label={`Open conversation with ${name || 'unknown contact'}`}
      />

      {/* Avatar: initials for known people, glyph for the rest */}
      <div
        className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-semibold ${
          thread.display_name
            ? 'bg-primary-100 text-primary-700'
            : 'bg-gray-100 text-gray-500'
        }`}
      >
        {thread.display_name ? (
          initials(thread.display_name)
        ) : websiteOnly ? (
          <Globe className="w-5 h-5" />
        ) : (
          <Phone className="w-5 h-5" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={`truncate text-sm ${unread ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}
          >
            {name || 'Unknown'}
          </span>
          <span className="text-xs text-gray-400 shrink-0">
            {formatTimeAgo(thread.last_activity_at)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 min-w-0">
          {chip && (
            <span
              className={`shrink-0 inline-flex px-1.5 py-0.5 rounded text-[11px] font-semibold ${chip.className}`}
            >
              {chip.label}
            </span>
          )}
          <p className={`truncate text-sm ${unread ? 'text-gray-900' : 'text-gray-500'}`}>
            {thread.preview.direction === 'outbound' && thread.preview.type === 'sms' ? 'You: ' : ''}
            {thread.preview.text}
          </p>
        </div>
      </div>

      {unread && (
        <span className="w-2.5 h-2.5 rounded-full bg-primary-600 shrink-0" aria-label="Unread" />
      )}

      {isUnknown && (
        <Link
          href={`/dashboard/leads/new?phone=${encodeURIComponent(thread.phone_e164 ?? thread.key)}`}
          onClick={(e) => e.stopPropagation()}
          className="relative z-20 shrink-0 inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg border border-primary-200 bg-primary-50 text-primary-700 text-xs font-semibold active:scale-95 transition"
        >
          <UserPlus className="w-3.5 h-3.5" />
          New lead
        </Link>
      )}
    </div>
  )
}
