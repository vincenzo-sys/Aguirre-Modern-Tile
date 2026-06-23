import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiOwner } from '@/lib/apiAuth'

// PATCH /api/crew/[id] — edit a crew member's rate/role/contact or deactivate.

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase not configured: missing SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key)
}

const EDITABLE_FIELDS = [
  'full_name',
  'nickname',
  'phone',
  'role',
  'day_rate',
  'hour_rate',
  'is_active',
  'profile_id',
  'notes',
] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiOwner(request)
  if (unauthorized) return unauthorized

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const updates: Record<string, unknown> = {}
  for (const field of EDITABLE_FIELDS) {
    if (field in body) updates[field] = body[field]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('crew_members')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
