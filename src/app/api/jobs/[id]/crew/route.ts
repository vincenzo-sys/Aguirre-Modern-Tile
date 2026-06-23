import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiAuth } from '@/lib/apiAuth'
import { getSessionProfileId } from '@/lib/sessionProfile'

// Crew assignments + labor for a single job (migration 039).
//   GET    — { assignments, labor } for the job, each joined with the crew member
//   POST   — assign a crew member to one or more dates: { crew_member_id, work_dates: string[] }
//   DELETE — unassign: ?assignment_id=... OR ?crew_member_id=...&work_date=...

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase not configured: missing SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key)
}

function fmtDate(iso: string): string {
  // iso is a YYYY-MM-DD date string; render "Tue Jun 24" without TZ drift.
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(request)
  if (unauthorized) return unauthorized

  const { id } = await params
  const supabaseAdmin = getSupabaseAdmin()

  const [{ data: assignments, error: aErr }, { data: labor, error: lErr }] = await Promise.all([
    supabaseAdmin
      .from('crew_assignments')
      .select('*, crew_member:crew_members(*)')
      .eq('job_id', id)
      .order('work_date', { ascending: true }),
    supabaseAdmin
      .from('labor_entries')
      .select('*, crew_member:crew_members(*)')
      .eq('job_id', id)
      .order('work_date', { ascending: true }),
  ])

  if (aErr || lErr) {
    return NextResponse.json({ error: (aErr ?? lErr)?.message }, { status: 500 })
  }
  return NextResponse.json({ assignments: assignments ?? [], labor: labor ?? [] })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(request)
  if (unauthorized) return unauthorized

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as {
    crew_member_id?: string
    work_dates?: string[]
    work_date?: string
  }

  const crewMemberId = body.crew_member_id
  const dates = body.work_dates ?? (body.work_date ? [body.work_date] : [])

  if (!crewMemberId || dates.length === 0) {
    return NextResponse.json({ error: 'crew_member_id and at least one work_date are required' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const profileId = await getSessionProfileId()

  const { data: crew } = await supabaseAdmin
    .from('crew_members')
    .select('full_name, nickname')
    .eq('id', crewMemberId)
    .single()

  // Upsert so re-assigning the same person/day is a no-op rather than an error.
  const rows = dates.map((work_date) => ({
    job_id: id,
    crew_member_id: crewMemberId,
    work_date,
    created_by: profileId,
  }))

  const { data: inserted, error } = await supabaseAdmin
    .from('crew_assignments')
    .upsert(rows, { onConflict: 'job_id,crew_member_id,work_date', ignoreDuplicates: true })
    .select('*, crew_member:crew_members(*)')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await appendCrewLog(
    supabaseAdmin,
    id,
    profileId,
    `Assigned ${crew?.nickname || crew?.full_name || 'crew'} for ${dates.map(fmtDate).join(', ')}`
  )

  return NextResponse.json({ assignments: inserted ?? [] }, { status: 201 })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(request)
  if (unauthorized) return unauthorized

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const assignmentId = searchParams.get('assignment_id')
  const crewMemberId = searchParams.get('crew_member_id')
  const workDate = searchParams.get('work_date')

  const supabaseAdmin = getSupabaseAdmin()
  let query = supabaseAdmin.from('crew_assignments').delete().eq('job_id', id)

  if (assignmentId) {
    query = query.eq('id', assignmentId)
  } else if (crewMemberId && workDate) {
    query = query.eq('crew_member_id', crewMemberId).eq('work_date', workDate)
  } else {
    return NextResponse.json(
      { error: 'Provide assignment_id, or both crew_member_id and work_date' },
      { status: 400 }
    )
  }

  const { error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// Prepends a timestamped line to jobs.crew_log, mirroring the final-payment route.
async function appendCrewLog(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  jobId: string,
  profileId: string | null,
  message: string
) {
  let authorName = 'Team'
  if (profileId) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', profileId)
      .single()
    if (profile?.full_name) authorName = profile.full_name
  }

  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('crew_log')
    .eq('id', jobId)
    .single()

  const stamp = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const logLine = `[${stamp} — ${authorName}] ${message}`
  const existing = typeof job?.crew_log === 'string' ? job.crew_log : ''
  const updated = existing ? `${logLine}\n${existing}` : logLine

  await supabaseAdmin.from('jobs').update({ crew_log: updated }).eq('id', jobId)
}
