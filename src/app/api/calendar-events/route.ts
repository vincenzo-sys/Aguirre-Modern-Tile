import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiAuth } from '@/lib/apiAuth'

// Service-role client. Auth is enforced by requireApiAuth (session cookie or
// X-API-Key); the admin client bypasses RLS so API-key callers behave the
// same as dashboard sessions. Same pattern as /api/jobs/[id].
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/calendar-events?from=ISO&to=ISO
// Returns events whose start_at falls in [from, to). The calendar view passes
// the visible month's range. If from/to are omitted, returns the next 90 days
// from now — keeps any "list everything" caller bounded.
export async function GET(req: NextRequest) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const fromIso = from ?? new Date().toISOString()
  const toIso = to ?? new Date(Date.now() + 90 * 86_400_000).toISOString()

  try {
    const supabase = getSupabase()
    // Catches both events that *start* in the window and events that started
    // earlier but are still ongoing (end_at >= window start). One union'd
    // .or() keeps it a single round-trip.
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .or(`and(start_at.gte.${fromIso},start_at.lt.${toIso}),and(start_at.lt.${fromIso},end_at.gte.${fromIso})`)
      .order('start_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data ?? [])
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/calendar-events
// Body: { title, start_at, end_at?, all_day?, job_id?, customer_id?, notes?, color? }
export async function POST(req: NextRequest) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  try {
    const body = await req.json()

    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }
    if (!body.start_at || isNaN(new Date(body.start_at).getTime())) {
      return NextResponse.json({ error: 'start_at must be a valid timestamp' }, { status: 400 })
    }
    if (body.end_at && isNaN(new Date(body.end_at).getTime())) {
      return NextResponse.json({ error: 'end_at must be a valid timestamp' }, { status: 400 })
    }

    const supabase = getSupabase()

    // created_by is best-effort: only stamped when the caller is a dashboard
    // session (cookie auth). API-key callers leave it null.
    let createdBy: string | null = null
    try {
      const { createClient: createSsr } = await import('@/lib/supabase/server')
      const ssr = await createSsr()
      const { data: { user } } = await ssr.auth.getUser()
      createdBy = user?.id ?? null
    } catch {
      // ignore — API-key request
    }

    const insert = {
      title,
      start_at: new Date(body.start_at).toISOString(),
      end_at: body.end_at ? new Date(body.end_at).toISOString() : null,
      all_day: Boolean(body.all_day),
      job_id: body.job_id || null,
      customer_id: body.customer_id || null,
      notes: typeof body.notes === 'string' ? body.notes : null,
      color: typeof body.color === 'string' ? body.color : null,
      created_by: createdBy,
    }

    const { data, error } = await supabase
      .from('calendar_events')
      .insert(insert)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
