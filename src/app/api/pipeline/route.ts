import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiAuth } from '@/lib/apiAuth'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// A unified pipeline item — either a raw quote_request or a job that's still
// in a sales-stage status. The Leads page renders these in a single ranked
// list so Vince can work the whole pipeline without flipping between tabs.
export type PipelineStage =
  | 'new'                  // quote_request just came in
  | 'reviewed'             // quote_request triaged
  | 'visit_scheduled'      // estimate site visit booked
  | 'lead_in_progress'     // job created but no estimate yet
  | 'estimate_sent'        // job in 'quoted' status
  | 'estimate_revised'     // job in 'estimate_revised' status

export type PipelineItem = {
  kind: 'quote_request' | 'job'
  id: string
  client_name: string
  client_phone: string | null
  client_email: string | null
  client_address: string | null
  source: string | null
  stage: PipelineStage
  estimated_cost: number | null
  site_visit_at: string | null
  next_follow_up: string | null
  last_contact_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  urgency: number  // higher = more urgent; 100 = overdue follow-up, 0 = healthy
  // Job-only:
  job_number?: number
  job_status?: string
  // Quote-request-only:
  project_type?: string
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  return Math.floor(ms / 86_400_000)
}

function isOverdue(date: string | null): boolean {
  if (!date) return false
  return date <= new Date().toISOString().slice(0, 10)
}

function computeUrgency(item: {
  next_follow_up: string | null
  last_contact_at: string | null
  created_at: string
  site_visit_at: string | null
}): number {
  // Overdue follow-up dominates
  if (isOverdue(item.next_follow_up)) return 100

  // Visit happening today / soon — high but not overdue
  if (item.site_visit_at) {
    const visitDay = item.site_visit_at.slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    if (visitDay === today) return 90
    if (visitDay < today) return 95  // visit was supposed to happen, no follow-up logged
  }

  // No contact in 7+ days
  const lastContactDays = daysSince(item.last_contact_at) ?? daysSince(item.created_at) ?? 0
  if (lastContactDays >= 14) return 70
  if (lastContactDays >= 7) return 50

  // Brand new (less than 24h old)
  if ((daysSince(item.created_at) ?? 0) < 1) return 60

  return 10
}

// GET /api/pipeline
//
// Returns the unified sales pipeline: every quote_request that's NOT yet
// converted/archived, plus every job in lead/quoted/estimate_revised status,
// merged into one ranked list. Once a job advances to accepted_not_scheduled
// (deposit paid / signed), it leaves this list and shows on the Jobs page.
export async function GET(req: NextRequest) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  try {
    const supabase = getSupabase()

    // Fetch in parallel
    const [quoteRes, jobRes] = await Promise.all([
      supabase
        .from('quote_requests')
        .select('id, status, client_name, client_email, client_phone, project_type, source, last_contact_at, next_follow_up, site_visit_at, notes, converted_job_id, created_at, updated_at, answers')
        .not('status', 'in', '(converted,archived)')
        .order('created_at', { ascending: false }),
      supabase
        .from('jobs')
        .select('id, job_number, status, client_name, client_email, client_phone, client_address, estimated_cost, scheduled_start, notes, created_at, updated_at')
        .in('status', ['lead', 'quoted', 'estimate_revised'])
        .order('created_at', { ascending: false }),
    ])

    if (quoteRes.error) {
      return NextResponse.json({ error: quoteRes.error.message }, { status: 500 })
    }
    if (jobRes.error) {
      return NextResponse.json({ error: jobRes.error.message }, { status: 500 })
    }

    const items: PipelineItem[] = []

    for (const q of quoteRes.data ?? []) {
      const stage: PipelineStage = q.site_visit_at
        ? 'visit_scheduled'
        : q.status === 'reviewed'
          ? 'reviewed'
          : 'new'
      const answers = (q.answers ?? {}) as { address?: string }
      items.push({
        kind: 'quote_request',
        id: q.id,
        client_name: q.client_name,
        client_phone: q.client_phone,
        client_email: q.client_email,
        client_address: answers.address ?? null,
        source: q.source,
        stage,
        estimated_cost: null,
        site_visit_at: q.site_visit_at,
        next_follow_up: q.next_follow_up,
        last_contact_at: q.last_contact_at,
        notes: q.notes,
        created_at: q.created_at,
        updated_at: q.updated_at,
        urgency: computeUrgency({
          next_follow_up: q.next_follow_up,
          last_contact_at: q.last_contact_at,
          created_at: q.created_at,
          site_visit_at: q.site_visit_at,
        }),
        project_type: q.project_type,
      })
    }

    for (const j of jobRes.data ?? []) {
      const stage: PipelineStage =
        j.status === 'quoted' ? 'estimate_sent'
        : j.status === 'estimate_revised' ? 'estimate_revised'
        : 'lead_in_progress'
      items.push({
        kind: 'job',
        id: j.id,
        client_name: j.client_name,
        client_phone: j.client_phone,
        client_email: j.client_email,
        client_address: j.client_address,
        source: null,
        stage,
        estimated_cost: j.estimated_cost,
        site_visit_at: null,
        next_follow_up: null,
        last_contact_at: null,
        notes: j.notes,
        created_at: j.created_at,
        updated_at: j.updated_at,
        urgency: computeUrgency({
          next_follow_up: null,
          last_contact_at: null,
          created_at: j.created_at,
          site_visit_at: null,
        }),
        job_number: j.job_number,
        job_status: j.status,
      })
    }

    // Sort: urgency desc, then most-recently-updated desc
    items.sort((a, b) => {
      if (b.urgency !== a.urgency) return b.urgency - a.urgency
      return b.updated_at.localeCompare(a.updated_at)
    })

    return NextResponse.json({ items, counts: { total: items.length, quote_requests: quoteRes.data?.length ?? 0, jobs: jobRes.data?.length ?? 0 } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
