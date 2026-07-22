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

export async function GET(request: NextRequest) {
  const unauthorized = await requireApiAuth(request)
  if (unauthorized) return unauthorized

  try {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const source = searchParams.get('source') || ''

  const supabaseAdmin = getSupabaseAdmin()

  let query = supabaseAdmin
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false })

  if (q) {
    // Strip PostgREST-reserved characters (, ( ) .) so user-supplied text
    // can't alter the .or() filter structure and 500 the request.
    const safeQ = q.replace(/[,().]/g, '')
    if (safeQ) {
      query = query.or(`name.ilike.%${safeQ}%,email.ilike.%${safeQ}%,phone.ilike.%${safeQ}%`)
    }
  }

  if (source && source !== 'all') {
    query = query.eq('source', source)
  }

  const { data: customers, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enrich with job count and total revenue
  const customerIds = (customers ?? []).map((c: { id: string }) => c.id)

  if (customerIds.length === 0) {
    return NextResponse.json(customers ?? [])
  }

  const { data: jobs } = await supabaseAdmin
    .from('jobs')
    .select('id, customer_id, amount_paid, created_at')
    .in('customer_id', customerIds)

  const statsMap: Record<string, { job_count: number; total_revenue: number; last_job_date: string | null }> = {}
  for (const job of (jobs ?? [])) {
    if (!job.customer_id) continue
    if (!statsMap[job.customer_id]) {
      statsMap[job.customer_id] = { job_count: 0, total_revenue: 0, last_job_date: null }
    }
    statsMap[job.customer_id].job_count++
    statsMap[job.customer_id].total_revenue += Number(job.amount_paid) || 0
    if (!statsMap[job.customer_id].last_job_date || job.created_at > statsMap[job.customer_id].last_job_date!) {
      statsMap[job.customer_id].last_job_date = job.created_at
    }
  }

  const enriched = (customers ?? []).map((c: { id: string }) => ({
    ...c,
    job_count: statsMap[c.id]?.job_count ?? 0,
    total_revenue: statsMap[c.id]?.total_revenue ?? 0,
    last_job_date: statsMap[c.id]?.last_job_date ?? null,
  }))

  return NextResponse.json(enriched)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Customers API error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiAuth(request)
  if (unauthorized) return unauthorized

  const supabaseAdmin = getSupabaseAdmin()
  const body = await request.json()
  const { name, email, phone, address, city, state, zip, notes, source = 'manual', referred_by_customer_id } = body

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  // Find-or-create: check for existing customer by email or phone
  if (email) {
    const { data: existing } = await supabaseAdmin
      .from('customers')
      .select('*')
      .ilike('email', email)
      .limit(1)
      .single()

    if (existing) {
      return NextResponse.json(existing)
    }
  }

  if (phone) {
    // Compare on digits-only so "(617) 766-1259" matches an existing record
    // stored as "6177661259" or "+16177661259" — otherwise the same customer
    // ends up with two records, splitting their job history.
    const phoneDigits = phone.replace(/\D/g, '')
    if (phoneDigits.length >= 10) {
      const last10 = phoneDigits.slice(-10)
      const { data: existing } = await supabaseAdmin
        .from('customers')
        .select('*')
        .or(`phone.eq.${phone},phone.like.%${last10}`)
        .limit(5)
      const match = existing?.find(
        (row: { phone: string | null }) => (row.phone || '').replace(/\D/g, '').slice(-10) === last10
      )
      if (match) {
        return NextResponse.json(match)
      }
    }
  }

  const { data: customer, error } = await supabaseAdmin
    .from('customers')
    .insert({ name, email: email || null, phone: phone || null, address: address || null, city: city || null, state: state || null, zip: zip || null, notes: notes || null, source, referred_by_customer_id: referred_by_customer_id || null })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(customer, { status: 201 })
}
