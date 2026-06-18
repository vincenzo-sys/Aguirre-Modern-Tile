import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiAuth } from '@/lib/apiAuth'
import { getSessionProfileId } from '@/lib/sessionProfile'
import { recomputeJobLaborActuals, resolveHourRate } from '@/lib/laborRollup'

// Labor hours for a job (migration 039). One timesheet row per crew member per
// day; POST upserts it, then rewrites the job's actual_labor_cost + actual_cost.
//   POST   — { crew_member_id, hours, work_date, note? }
//   DELETE — ?entry_id=... OR ?crew_member_id=...&work_date=...

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase not configured: missing SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key)
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
    hours?: number
    work_date?: string
    note?: string
  }

  const crewMemberId = body.crew_member_id
  const hours = Number(body.hours)
  const workDate = body.work_date

  if (!crewMemberId || !workDate) {
    return NextResponse.json({ error: 'crew_member_id and work_date are required' }, { status: 400 })
  }
  if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
    return NextResponse.json({ error: 'hours must be between 0 and 24' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const profileId = await getSessionProfileId()

  const { data: crew, error: crewErr } = await supabaseAdmin
    .from('crew_members')
    .select('id, day_rate, hour_rate')
    .eq('id', crewMemberId)
    .single()

  if (crewErr || !crew) {
    return NextResponse.json({ error: 'Crew member not found' }, { status: 404 })
  }

  const rateApplied = resolveHourRate(crew)
  const laborCost = Math.round(hours * rateApplied * 100) / 100

  const { data: entry, error } = await supabaseAdmin
    .from('labor_entries')
    .upsert(
      {
        job_id: id,
        crew_member_id: crewMemberId,
        work_date: workDate,
        hours,
        rate_applied: rateApplied,
        labor_cost: laborCost,
        note: body.note?.trim() || null,
        logged_by: profileId,
      },
      { onConflict: 'job_id,crew_member_id,work_date' }
    )
    .select('*, crew_member:crew_members(*)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const totals = await recomputeJobLaborActuals(supabaseAdmin, id)
  return NextResponse.json({ entry, ...totals }, { status: 201 })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(request)
  if (unauthorized) return unauthorized

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const entryId = searchParams.get('entry_id')
  const crewMemberId = searchParams.get('crew_member_id')
  const workDate = searchParams.get('work_date')

  const supabaseAdmin = getSupabaseAdmin()
  let query = supabaseAdmin.from('labor_entries').delete().eq('job_id', id)

  if (entryId) {
    query = query.eq('id', entryId)
  } else if (crewMemberId && workDate) {
    query = query.eq('crew_member_id', crewMemberId).eq('work_date', workDate)
  } else {
    return NextResponse.json(
      { error: 'Provide entry_id, or both crew_member_id and work_date' },
      { status: 400 }
    )
  }

  const { error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const totals = await recomputeJobLaborActuals(supabaseAdmin, id)
  return NextResponse.json({ ok: true, ...totals })
}
