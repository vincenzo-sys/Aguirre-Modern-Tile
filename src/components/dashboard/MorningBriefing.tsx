import Link from 'next/link'
import { AlertCircle, Clock, Send, ArrowRight } from 'lucide-react'
import type { Job, QuoteRequest } from '@/lib/supabase/types'

// Compact briefing strip at the top of the owner dashboard.
// Replaces what used to go to Discord — surfaces the three things the
// nurture cron tracks so Vince sees them when he opens the dashboard in
// the morning.

export default function MorningBriefing({
  jobs,
  leads,
  todayStr,
}: {
  jobs: Job[]
  leads: QuoteRequest[]
  todayStr: string
}) {
  // Stale leads: created >5 days ago, still in new/reviewed, no site visit, not converted
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
  const staleLeads = leads.filter((l) => {
    if (l.status !== 'new' && l.status !== 'reviewed') return false
    if (l.converted_job_id) return false
    if (l.site_visit_at) return false
    return l.created_at < fiveDaysAgo
  })

  // Contact queue: anything (job or lead) with a contact date <= today and still open
  const openStatuses = new Set(['lead', 'quoted', 'estimate_revised', 'accepted_not_scheduled', 'scheduled', 'in_progress', 'waiting_for_materials'])
  const contactDueJobs = jobs.filter((j) => {
    if (!j.next_contact_date) return false
    if (!openStatuses.has(j.status)) return false
    return j.next_contact_date <= todayStr
  })
  const contactDueLeads = leads.filter((l) => {
    if (l.status !== 'new' && l.status !== 'reviewed') return false
    if (l.converted_job_id) return false
    if (!l.next_follow_up) return false
    return l.next_follow_up <= todayStr
  })
  const contactQueueCount = contactDueJobs.length + contactDueLeads.length

  // Auto-nudges sent in last 24h (proxy via last_contact_at + follow_up_count)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const nudgedToday = jobs.filter(
    (j) => (j.follow_up_count ?? 0) > 0 && j.last_contact_at && j.last_contact_at >= oneDayAgo
  ).length

  // If nothing is actionable, render nothing — keep the dashboard clean.
  if (staleLeads.length === 0 && contactQueueCount === 0 && nudgedToday === 0) {
    return null
  }

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Morning briefing
        </h2>
        <span className="text-xs text-gray-400">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Stale leads */}
        <Link
          href="/dashboard/leads"
          className={`rounded-lg border p-3 transition-colors ${
            staleLeads.length > 0
              ? 'border-amber-200 bg-amber-50 hover:bg-amber-100'
              : 'border-gray-200 bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className={`w-4 h-4 ${staleLeads.length > 0 ? 'text-amber-700' : 'text-gray-400'}`} />
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Stale leads
            </span>
          </div>
          <p className={`text-lg font-bold ${staleLeads.length > 0 ? 'text-amber-900' : 'text-gray-400'}`}>
            {staleLeads.length === 0 ? 'All fresh' : `${staleLeads.length} need${staleLeads.length === 1 ? 's' : ''} touch`}
          </p>
          {staleLeads.length > 0 && (
            <p className="text-xs text-amber-800 truncate mt-0.5">
              {staleLeads
                .slice(0, 3)
                .map((l) => {
                  const days = Math.floor((Date.now() - new Date(l.created_at).getTime()) / 86_400_000)
                  return `${l.client_name} (${days}d)`
                })
                .join(' · ')}
              {staleLeads.length > 3 && ` · +${staleLeads.length - 3}`}
            </p>
          )}
        </Link>

        {/* Contact queue */}
        <Link
          href="/dashboard/leads"
          className={`rounded-lg border p-3 transition-colors ${
            contactQueueCount > 0
              ? 'border-blue-200 bg-blue-50 hover:bg-blue-100'
              : 'border-gray-200 bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Clock className={`w-4 h-4 ${contactQueueCount > 0 ? 'text-blue-700' : 'text-gray-400'}`} />
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Contact today
            </span>
          </div>
          <p className={`text-lg font-bold ${contactQueueCount > 0 ? 'text-blue-900' : 'text-gray-400'}`}>
            {contactQueueCount === 0 ? 'Clear' : `${contactQueueCount} on queue`}
          </p>
          {contactQueueCount > 0 && (
            <p className="text-xs text-blue-800 truncate mt-0.5">
              {[...contactDueLeads, ...contactDueJobs]
                .slice(0, 3)
                .map((item) => item.client_name)
                .join(' · ')}
              {contactQueueCount > 3 && ` · +${contactQueueCount - 3}`}
            </p>
          )}
        </Link>

        {/* Auto-nudges sent */}
        <div
          className={`rounded-lg border p-3 ${
            nudgedToday > 0
              ? 'border-green-200 bg-green-50'
              : 'border-gray-200 bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Send className={`w-4 h-4 ${nudgedToday > 0 ? 'text-green-700' : 'text-gray-400'}`} />
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Auto-nudges sent
            </span>
          </div>
          <p className={`text-lg font-bold ${nudgedToday > 0 ? 'text-green-900' : 'text-gray-400'}`}>
            {nudgedToday === 0 ? 'None today' : `${nudgedToday} in last 24h`}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Cron runs 8 AM daily
          </p>
        </div>
      </div>
    </div>
  )
}
