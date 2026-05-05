import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiAuth } from '@/lib/apiAuth'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const ALLOWED_FIELDS = [
  'title',
  'start_at',
  'end_at',
  'all_day',
  'job_id',
  'customer_id',
  'notes',
  'color',
] as const

// PATCH /api/calendar-events/[id] — Update a calendar event
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  const { id } = await params

  try {
    const body = await req.json()
    const updates: Record<string, unknown> = {}

    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        if (field === 'start_at' || field === 'end_at') {
          const v = body[field]
          if (v === null) {
            updates[field] = null
          } else if (typeof v === 'string' && !isNaN(new Date(v).getTime())) {
            updates[field] = new Date(v).toISOString()
          } else {
            return NextResponse.json({ error: `${field} must be a valid timestamp or null` }, { status: 400 })
          }
        } else {
          updates[field] = body[field]
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('calendar_events')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Event not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE /api/calendar-events/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  const { id } = await params

  try {
    const supabase = getSupabase()
    const { error } = await supabase.from('calendar_events').delete().eq('id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ deleted: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
