import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiAuth } from '@/lib/apiAuth'
import type { JobLineItem, JobStatus } from '@/lib/supabase/types'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/jobs — list jobs with optional filters:
//   ?status=scheduled         single status
//   ?status=scheduled,in_progress   comma-separated
//   ?from=2026-04-20&to=2026-04-27 scheduled_start range
//   ?assigned_to=<uuid>
//   ?limit=50 (default 100, max 500)
export async function GET(request: NextRequest) {
  const unauthorized = await requireApiAuth(request)
  if (unauthorized) return unauthorized

  try {
    const supabase = getSupabaseAdmin()
    const sp = request.nextUrl.searchParams

    let query = supabase.from('jobs').select('*').order('scheduled_start', {
      ascending: true,
      nullsFirst: false,
    })

    const status = sp.get('status')
    if (status) {
      const values = status.split(',').map((s) => s.trim()).filter(Boolean)
      if (values.length === 1) query = query.eq('status', values[0])
      else if (values.length > 1) query = query.in('status', values)
    }

    const from = sp.get('from')
    if (from) query = query.gte('scheduled_start', from)
    const to = sp.get('to')
    if (to) query = query.lte('scheduled_start', to)

    const assignedTo = sp.get('assigned_to')
    if (assignedTo) query = query.eq('assigned_to', assignedTo)

    const rawLimit = parseInt(sp.get('limit') ?? '100', 10)
    const limit = Math.max(1, Math.min(500, isNaN(rawLimit) ? 100 : rawLimit))
    query = query.limit(limit)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data ?? [])
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/jobs — create a new job with optional find-or-create customer
export async function POST(request: NextRequest) {
  const unauthorized = await requireApiAuth(request)
  if (unauthorized) return unauthorized

  try {
    const supabase = getSupabaseAdmin()
    const body = await request.json()

    const {
      title,
      client_name,
      client_phone,
      client_email,
      client_address,
      customer_id: providedCustomerId,
      job_type,
      square_footage,
      scope_notes,
      scheduled_start,
      scheduled_end,
      estimated_days,
      estimated_cost,
      line_items = [],
      assigned_to,
      notes,
      crew_instructions,
      customer_provides,
      status = 'lead',
      from_lead_id,
    } = body as {
      title?: string
      client_name?: string
      client_phone?: string
      client_email?: string
      client_address?: string
      customer_id?: string
      job_type?: string
      square_footage?: number
      scope_notes?: string
      scheduled_start?: string
      scheduled_end?: string
      estimated_days?: number
      estimated_cost?: number
      line_items?: JobLineItem[]
      assigned_to?: string
      notes?: string
      crew_instructions?: string
      customer_provides?: string
      status?: JobStatus
      from_lead_id?: string
    }

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }
    if (!client_name) {
      return NextResponse.json({ error: 'client_name is required' }, { status: 400 })
    }

    let customerId: string | null = providedCustomerId ?? null

    if (!customerId) {
      if (client_email) {
        const { data: existing } = await supabase
          .from('customers')
          .select('id')
          .ilike('email', client_email)
          .limit(1)
          .single()
        if (existing) customerId = existing.id
      }
      if (!customerId && client_phone) {
        const { data: existing } = await supabase
          .from('customers')
          .select('id')
          .eq('phone', client_phone)
          .limit(1)
          .single()
        if (existing) customerId = existing.id
      }
      if (!customerId) {
        const { data: newCustomer } = await supabase
          .from('customers')
          .insert({
            name: client_name,
            email: client_email || null,
            phone: client_phone || null,
            address: client_address || null,
            source: 'manual',
          })
          .select('id')
          .single()
        if (newCustomer) customerId = newCustomer.id
      }
    }

    const { data: job, error } = await supabase
      .from('jobs')
      .insert({
        title,
        status,
        customer_id: customerId,
        client_name,
        client_phone: client_phone || null,
        client_email: client_email || null,
        client_address: client_address || null,
        job_type: job_type || null,
        square_footage: square_footage ?? null,
        scope_notes: scope_notes || null,
        scheduled_start: scheduled_start || null,
        scheduled_end: scheduled_end || null,
        estimated_days: estimated_days ?? null,
        estimated_cost: estimated_cost ?? null,
        amount_invoiced: 0,
        amount_paid: 0,
        line_items,
        assigned_to: assigned_to || null,
        notes: notes || null,
        crew_instructions: crew_instructions || null,
        customer_provides: customer_provides || null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (from_lead_id && job) {
      await supabase
        .from('quote_requests')
        .update({ status: 'converted', converted_job_id: job.id })
        .eq('id', from_lead_id)
    }

    return NextResponse.json(job, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
