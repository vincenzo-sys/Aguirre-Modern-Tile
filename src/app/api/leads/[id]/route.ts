import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiAuth } from '@/lib/apiAuth'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase not configured: missing SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiAuth(request)
  if (unauthorized) return unauthorized

  try {
    const { id } = await params
    const supabase = getSupabaseAdmin()

    const { data: lead, error } = await supabase
      .from('quote_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json(lead)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiAuth(request)
  if (unauthorized) return unauthorized

  try {
    const { id } = await params
    const supabase = getSupabaseAdmin()
    const body = await request.json()

    const allowed: Record<string, unknown> = {}
    for (const key of [
      'status',
      'client_name',
      'client_email',
      'client_phone',
      'project_type',
      'source',
      'notes',
      'next_follow_up',
      'last_contact_at',
      'lost_reason',
      'answers',
      'site_visit_at',
      'site_visit_notes',
      'converted_job_id',
    ]) {
      if (key in body) allowed[key] = body[key]
    }

    const { data: lead, error } = await supabase
      .from('quote_requests')
      .update(allowed)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(lead)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE /api/leads/[id] — permanently remove a quote_request (lead).
// quote_request_photos cascade-delete (migration 016, ON DELETE CASCADE) and
// nothing else FKs to quote_requests, so the row goes cleanly. No payment/
// estimate guards: leads carry no money. (Like the jobs DELETE, storage files
// in the 'quote-photos' bucket are left orphaned — only DB rows are removed.)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiAuth(request)
  if (unauthorized) return unauthorized

  try {
    const { id } = await params
    const supabase = getSupabaseAdmin()

    const { data: lead, error: fetchErr } = await supabase
      .from('quote_requests')
      .select('id, client_name, status')
      .eq('id', id)
      .single()

    if (fetchErr || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const { error: delErr } = await supabase.from('quote_requests').delete().eq('id', id)
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 })
    }

    console.log(`[Leads] Deleted quote_request ${id} "${lead.client_name}" — status=${lead.status}`)

    return NextResponse.json({ deleted: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
