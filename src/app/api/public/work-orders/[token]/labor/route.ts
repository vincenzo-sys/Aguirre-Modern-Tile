import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { recomputeJobLaborActuals, resolveHourRate } from '@/lib/laborRollup'

// Public — no auth, gated only by the work_order_token (same gate as the
// crew-facing work order GET). Lets the install crew log their own hours from
// the link Vince texts them, with NO login.
//
// MONEY NEVER CROSSES THIS BOUNDARY: this route never returns or accepts
// rates/costs. The rate is looked up server-side to snapshot labor_cost, but
// only hours go back to the client — mirroring why the work order GET omits
// pricing columns entirely.

async function resolveJob(token: string) {
  const supabase = createServiceClient()
  const { data: job } = await supabase
    .from('jobs')
    .select('id')
    .eq('work_order_token', token)
    .single()
  return { supabase, jobId: job?.id as string | undefined }
}

type CrewLite = { id: string; full_name: string; nickname: string | null; is_active: boolean }

// Active crew ASSIGNED to this job (de-duped). May be empty when Vince hasn't
// assigned anyone yet. BOTH the GET picker and the POST write authorize against
// this set — deliberately NO roster fallback anywhere — so a token holder can
// never see or log labor for crew who aren't part of the job, and the picker
// never offers a name that POST would reject with 403.
async function assignedCrew(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string
): Promise<CrewLite[]> {
  const { data: assignments } = await supabase
    .from('crew_assignments')
    .select('crew_member:crew_members(id, full_name, nickname, is_active)')
    .eq('job_id', jobId)

  const assigned = (assignments ?? [])
    .map((a) => a.crew_member as unknown as CrewLite)
    .filter((c): c is CrewLite => !!c && c.is_active)

  // De-dupe (a crew member can be assigned multiple days).
  const byId = new Map<string, CrewLite>()
  for (const c of assigned) byId.set(c.id, c)
  return Array.from(byId.values())
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { supabase, jobId } = await resolveJob(token)
  if (!jobId) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  }

  // Crew the holder may log for (names only — never rates). ASSIGNED crew only,
  // matching the POST write path — the picker never offers a name POST rejects.
  // Empty until Vince assigns crew to the job.
  const roster = await assignedCrew(supabase, jobId)

  // Existing hours — no cost, just who/when/how-many.
  const { data: labor } = await supabase
    .from('labor_entries')
    .select('id, work_date, hours, crew_member:crew_members(full_name, nickname)')
    .eq('job_id', jobId)
    .order('work_date', { ascending: true })

  const crew = roster.map((c) => ({ id: c.id, name: c.nickname || c.full_name }))

  const entries = (labor ?? []).map((e) => {
    const c = e.crew_member as unknown as { full_name: string; nickname: string | null } | null
    return {
      id: e.id,
      work_date: e.work_date,
      hours: e.hours,
      name: c?.nickname || c?.full_name || 'Crew',
    }
  })

  return NextResponse.json({ crew, entries })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { supabase, jobId } = await resolveJob(token)
  if (!jobId) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  }

  const body = (await req.json().catch(() => ({}))) as {
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
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return NextResponse.json({ error: 'hours must be between 0 and 24' }, { status: 400 })
  }

  // Authorize against ASSIGNED crew only — NO roster fallback. The holder may
  // log labor only for an active crew member explicitly assigned to this job.
  // When the job has no assignments yet, assignedCrew() is empty and this
  // rejects outright, rather than trusting the token holder to write labor for
  // arbitrary crew (which would corrupt job costing).
  const assigned = await assignedCrew(supabase, jobId)
  if (!assigned.some((c) => c.id === crewMemberId)) {
    return NextResponse.json({ error: 'Crew member not assigned to this job' }, { status: 403 })
  }

  // Rate is looked up server-side only to snapshot labor_cost; never returned.
  const { data: crew } = await supabase
    .from('crew_members')
    .select('id, day_rate, hour_rate')
    .eq('id', crewMemberId)
    .single()

  if (!crew) {
    return NextResponse.json({ error: 'Crew member not found' }, { status: 404 })
  }

  const rateApplied = resolveHourRate(crew)
  const laborCost = Math.round(hours * rateApplied * 100) / 100

  const { error } = await supabase
    .from('labor_entries')
    .upsert(
      {
        job_id: jobId,
        crew_member_id: crewMemberId,
        work_date: workDate,
        hours,
        rate_applied: rateApplied,
        labor_cost: laborCost,
        note: body.note?.trim() || null,
        logged_by: null, // logged via the crew link, not a dashboard login
      },
      { onConflict: 'job_id,crew_member_id,work_date' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await recomputeJobLaborActuals(supabase, jobId)

  // Return hours only — never the cost.
  return NextResponse.json({ ok: true, hours }, { status: 201 })
}
