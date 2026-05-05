import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiAuth } from '@/lib/apiAuth'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export type ScheduleEvent =
  | {
      kind: 'estimate_visit'
      id: string
      title: string
      start: string
      address: string | null
      phone: string | null
      notes: string | null
      lead_id: string
    }
  | {
      kind: 'install'
      id: string
      title: string
      start: string
      end: string
      status: string
      address: string | null
      phone: string | null
      job_number: number
    }
  | {
      // Ad-hoc calendar entries from the calendar_events table (migration 033).
      // Things like "glass door follow-up at 6pm" that don't belong in the
      // jobs pipeline. The job_id (when present) is what lets the chip pull
      // address/phone from the linked job for tap-through.
      kind: 'custom'
      id: string
      title: string
      start: string
      end: string | null
      all_day: boolean
      notes: string | null
      job_id: string | null
      address: string | null
      phone: string | null
    }

// GET /api/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Returns the union of two event types within the window:
//   - estimate_visit: scheduled in-person estimate appointments (point in time)
//   - install: scheduled job installs (date range)
//
// Defaults to the current month if from/to omitted. Both bounds inclusive.
export async function GET(req: NextRequest) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  const url = new URL(req.url)
  const today = new Date()
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1)
  const defaultTo = new Date(today.getFullYear(), today.getMonth() + 2, 0)

  const from = url.searchParams.get('from') ?? defaultFrom.toISOString().slice(0, 10)
  const to = url.searchParams.get('to') ?? defaultTo.toISOString().slice(0, 10)

  try {
    const supabase = getSupabase()

    // Estimate visits: stored on quote_requests as a single timestamptz.
    // Filter by date range on the timestamp portion.
    const visitsPromise = supabase
      .from('quote_requests')
      .select('id, client_name, client_phone, site_visit_at, site_visit_notes, project_type, answers')
      .gte('site_visit_at', `${from}T00:00:00Z`)
      .lte('site_visit_at', `${to}T23:59:59Z`)
      .not('site_visit_at', 'is', null)
      .order('site_visit_at', { ascending: true })

    // Installs: jobs with scheduled_start within window. Include jobs that
    // start before the window but end inside it (multi-day installs).
    const jobsPromise = supabase
      .from('jobs')
      .select('id, job_number, title, status, scheduled_start, scheduled_end, client_name, client_address, client_phone')
      .not('scheduled_start', 'is', null)
      .lte('scheduled_start', to)
      .or(`scheduled_end.gte.${from},scheduled_end.is.null`)
      .order('scheduled_start', { ascending: true })

    // Custom events: ad-hoc calendar entries. start_at is timestamptz, so
    // compare against the from/to *date* boundaries by widening to whole days.
    // Same overlap pattern as /api/calendar-events: events that start in the
    // window OR started earlier and are still ongoing.
    const fromIso = `${from}T00:00:00Z`
    const toIso = `${to}T23:59:59Z`
    const customPromise = supabase
      .from('calendar_events')
      .select('id, title, start_at, end_at, all_day, notes, job_id')
      .or(`and(start_at.gte.${fromIso},start_at.lte.${toIso}),and(start_at.lt.${fromIso},end_at.gte.${fromIso})`)
      .order('start_at', { ascending: true })

    const [visitsRes, jobsRes, customRes] = await Promise.all([
      visitsPromise,
      jobsPromise,
      customPromise,
    ])

    if (visitsRes.error) {
      return NextResponse.json({ error: visitsRes.error.message }, { status: 500 })
    }
    if (jobsRes.error) {
      return NextResponse.json({ error: jobsRes.error.message }, { status: 500 })
    }

    const events: ScheduleEvent[] = []

    for (const v of visitsRes.data ?? []) {
      const answers = (v.answers ?? {}) as { description?: string; address?: string }
      events.push({
        kind: 'estimate_visit',
        id: v.id,
        lead_id: v.id,
        title: `Estimate visit — ${v.client_name}`,
        start: v.site_visit_at as string,
        address: answers.address ?? null,
        phone: v.client_phone,
        notes: v.site_visit_notes,
      })
    }

    // Build a job lookup so custom events linked to a job can inherit the
    // customer's address/phone — that's the whole point of the link: Christian
    // taps the event and gets directions + a callable number.
    const jobLookup = new Map<string, { address: string | null; phone: string | null }>()
    for (const j of jobsRes.data ?? []) {
      jobLookup.set(j.id, { address: j.client_address, phone: j.client_phone })
      events.push({
        kind: 'install',
        id: j.id,
        job_number: j.job_number,
        title: j.title || `${j.client_name} — Install`,
        start: j.scheduled_start as string,
        end: (j.scheduled_end as string) || (j.scheduled_start as string),
        status: j.status,
        address: j.client_address,
        phone: j.client_phone,
      })
    }

    if (customRes.error) {
      return NextResponse.json({ error: customRes.error.message }, { status: 500 })
    }

    for (const c of customRes.data ?? []) {
      const linked = c.job_id ? jobLookup.get(c.job_id) : undefined
      events.push({
        kind: 'custom',
        id: c.id,
        title: c.title,
        start: c.start_at as string,
        end: (c.end_at as string) ?? null,
        all_day: Boolean(c.all_day),
        notes: c.notes,
        job_id: c.job_id ?? null,
        address: linked?.address ?? null,
        phone: linked?.phone ?? null,
      })
    }

    return NextResponse.json({ from, to, events })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
