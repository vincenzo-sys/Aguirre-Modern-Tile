import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabaseAdmin = getSupabaseAdmin()

  const { data: customer, error } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  // Fetch related data in parallel
  const [jobsResult, quotesResult, invoicesResult] = await Promise.all([
    supabaseAdmin
      .from('jobs')
      .select('*')
      .eq('customer_id', id)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('quote_requests')
      .select('*')
      .eq('customer_id', id)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('customer_id', id)
      .order('created_at', { ascending: false }),
  ])

  return NextResponse.json({
    ...customer,
    jobs: jobsResult.data ?? [],
    quotes: quotesResult.data ?? [],
    invoices: invoicesResult.data ?? [],
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  const allowedFields = ['name', 'email', 'phone', 'address', 'city', 'state', 'zip', 'notes', 'source']
  const updates: Record<string, string | null> = {}
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field] || null
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: customer, error } = await supabaseAdmin
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(customer)
}
