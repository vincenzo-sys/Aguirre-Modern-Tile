import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase not configured: missing SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const body = await request.json()
    const {
      client_name,
      client_email,
      client_phone,
      project_type,
      source = 'phone',
      notes,
      next_follow_up,
      answers = {},
    } = body

    if (!client_name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (!project_type) {
      return NextResponse.json({ error: 'Project type is required' }, { status: 400 })
    }

    let customerId: string | null = null

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
          source: 'manual',
        })
        .select('id')
        .single()
      if (newCustomer) customerId = newCustomer.id
    }

    const { data: lead, error } = await supabase
      .from('quote_requests')
      .insert({
        client_name,
        client_email: client_email || '',
        client_phone: client_phone || '',
        project_type,
        answers,
        status: 'new',
        customer_id: customerId,
        source,
        notes: notes || null,
        next_follow_up: next_follow_up || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Lead create error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(lead, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Leads POST error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
