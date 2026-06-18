import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiAuth } from '@/lib/apiAuth'

// Crew roster (migration 039). GET lists crew; POST adds one.
// Crew members are NOT dashboard logins — see migration 039 for why.

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase not configured: missing SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key)
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireApiAuth(request)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(request.url)
  const includeInactive = searchParams.get('all') === '1'

  const supabaseAdmin = getSupabaseAdmin()
  let query = supabaseAdmin
    .from('crew_members')
    .select('*')
    .order('full_name', { ascending: true })

  if (!includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiAuth(request)
  if (unauthorized) return unauthorized

  const supabaseAdmin = getSupabaseAdmin()
  const body = (await request.json().catch(() => ({}))) as {
    full_name?: string
    nickname?: string
    phone?: string
    role?: string
    day_rate?: number
    hour_rate?: number
    profile_id?: string
    notes?: string
  }

  const full_name = (body.full_name ?? '').trim()
  if (!full_name) {
    return NextResponse.json({ error: 'full_name is required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('crew_members')
    .insert({
      full_name,
      nickname: body.nickname?.trim() || null,
      phone: body.phone?.trim() || null,
      role: body.role?.trim() || 'installer',
      day_rate: Number.isFinite(Number(body.day_rate)) ? Number(body.day_rate) : 250,
      hour_rate: Number.isFinite(Number(body.hour_rate)) ? Number(body.hour_rate) : null,
      profile_id: body.profile_id || null,
      notes: body.notes?.trim() || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
