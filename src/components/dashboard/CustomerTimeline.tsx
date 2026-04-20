import Link from 'next/link'
import {
  Inbox,
  MapPin,
  Briefcase,
  DollarSign,
  Calendar,
  Hammer,
  CheckCircle2,
  FileText,
  XCircle,
} from 'lucide-react'
import type { Invoice, Job, QuoteRequest } from '@/lib/supabase/types'

type EventIconKey =
  | 'lead'
  | 'site_visit'
  | 'job'
  | 'deposit'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'invoice'
  | 'paid'
  | 'lost'

const iconFor: Record<EventIconKey, typeof Inbox> = {
  lead: Inbox,
  site_visit: MapPin,
  job: Briefcase,
  deposit: DollarSign,
  scheduled: Calendar,
  in_progress: Hammer,
  completed: CheckCircle2,
  invoice: FileText,
  paid: DollarSign,
  lost: XCircle,
}

const colorFor: Record<EventIconKey, string> = {
  lead: 'bg-yellow-100 text-yellow-700',
  site_visit: 'bg-amber-100 text-amber-700',
  job: 'bg-blue-100 text-blue-700',
  deposit: 'bg-green-100 text-green-700',
  scheduled: 'bg-purple-100 text-purple-700',
  in_progress: 'bg-orange-100 text-orange-700',
  completed: 'bg-emerald-100 text-emerald-700',
  invoice: 'bg-indigo-100 text-indigo-700',
  paid: 'bg-emerald-100 text-emerald-700',
  lost: 'bg-gray-100 text-gray-500',
}

type TimelineEvent = {
  at: string
  icon: EventIconKey
  title: string
  detail?: string
  href?: string
}

function fmt(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(amount)
}

function fmtDate(isoOrDate: string): string {
  const d = isoOrDate.includes('T')
    ? new Date(isoOrDate)
    : new Date(isoOrDate + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function CustomerTimeline({
  quotes,
  jobs,
  invoices,
}: {
  quotes: QuoteRequest[]
  jobs: Job[]
  invoices: Invoice[]
}) {
  const events: TimelineEvent[] = []

  // Leads → request + site visit + lost
  for (const q of quotes) {
    events.push({
      at: q.created_at,
      icon: 'lead',
      title: `Lead received (${q.source ?? 'website'})`,
      detail: q.project_type.replace('-', ' '),
      href: `/dashboard/leads/${q.id}`,
    })
    if (q.site_visit_at) {
      events.push({
        at: q.site_visit_at,
        icon: 'site_visit',
        title: 'Site visit',
        detail: q.site_visit_notes ?? undefined,
        href: `/dashboard/leads/${q.id}`,
      })
    }
    if (q.status === 'archived' && q.lost_reason) {
      events.push({
        at: q.updated_at,
        icon: 'lost',
        title: 'Lead lost',
        detail: q.lost_reason,
        href: `/dashboard/leads/${q.id}`,
      })
    }
  }

  // Jobs → created, scheduled, deposit, in-progress, completed
  for (const j of jobs) {
    events.push({
      at: j.created_at,
      icon: 'job',
      title: 'Job created',
      detail: j.title,
      href: `/dashboard/jobs/${j.id}`,
    })

    if ((j.amount_paid ?? 0) > 0) {
      events.push({
        at: j.updated_at,
        icon: 'deposit',
        title: 'Deposit recorded',
        detail: `${fmt(Number(j.amount_paid))} on ${j.title}`,
        href: `/dashboard/jobs/${j.id}`,
      })
    }

    if (j.scheduled_start) {
      events.push({
        at: j.scheduled_start,
        icon: 'scheduled',
        title: 'Scheduled',
        detail: `${j.title}${j.scheduled_end && j.scheduled_end !== j.scheduled_start ? ` → ${fmtDate(j.scheduled_end)}` : ''}`,
        href: `/dashboard/jobs/${j.id}`,
      })
    }

    if (j.status === 'in_progress') {
      events.push({
        at: j.updated_at,
        icon: 'in_progress',
        title: 'Work in progress',
        detail: j.title,
        href: `/dashboard/jobs/${j.id}`,
      })
    }

    if (j.status === 'completed' || j.status === 'paid') {
      events.push({
        at: j.updated_at,
        icon: 'completed',
        title: 'Work completed',
        detail: j.title,
        href: `/dashboard/jobs/${j.id}`,
      })
    }
  }

  // Invoices → created, paid
  for (const inv of invoices) {
    events.push({
      at: inv.created_at,
      icon: 'invoice',
      title: `Invoice ${inv.invoice_number} created`,
      detail: fmt(inv.amount),
      href: `/dashboard/invoices/${inv.id}`,
    })
    if (inv.status === 'paid') {
      events.push({
        at: inv.updated_at,
        icon: 'paid',
        title: `Invoice ${inv.invoice_number} paid`,
        detail: fmt(inv.amount),
        href: `/dashboard/invoices/${inv.id}`,
      })
    }
  }

  // Sort newest first
  events.sort((a, b) => b.at.localeCompare(a.at))

  if (events.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <p className="text-sm text-gray-500">No activity yet with this customer.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200">
        <h3 className="text-base font-semibold text-gray-900">History</h3>
        <p className="text-xs text-gray-500 mt-0.5">Every touchpoint with this customer, newest first.</p>
      </div>
      <ol className="divide-y divide-gray-100">
        {events.map((e, i) => {
          const Icon = iconFor[e.icon]
          const isFutureDate =
            !e.at.includes('T') && e.at > new Date().toISOString().slice(0, 10)
          return (
            <li key={i} className="flex items-start gap-3 px-5 py-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colorFor[e.icon]}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-900">
                    {e.href ? (
                      <Link href={e.href} className="hover:text-primary-600">
                        {e.title}
                      </Link>
                    ) : (
                      e.title
                    )}
                    {isFutureDate && (
                      <span className="ml-2 text-xs font-normal text-purple-600">upcoming</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 whitespace-nowrap">
                    {e.at.includes('T') ? fmtDateTime(e.at) : fmtDate(e.at)}
                  </p>
                </div>
                {e.detail && <p className="text-xs text-gray-500 mt-0.5 truncate">{e.detail}</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
