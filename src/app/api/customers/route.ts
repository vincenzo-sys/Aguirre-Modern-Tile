import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const source = searchParams.get('source') || ''

  let query = supabaseAdmin
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false })

  if (q) {
    query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
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
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, email, phone, address, city, state, zip, notes, source = 'manual' } = body

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
    const { data: existing } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('phone', phone)
      .limit(1)
      .single()

    if (existing) {
      return NextResponse.json(existing)
    }
  }

  const { data: customer, error } = await supabaseAdmin
    .from('customers')
    .insert({ name, email: email || null, phone: phone || null, address: address || null, city: city || null, state: state || null, zip: zip || null, notes: notes || null, source })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(customer, { status: 201 })
}
