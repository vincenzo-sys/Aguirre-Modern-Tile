import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiAuth } from '@/lib/apiAuth'
import { findCustomerByPhone } from '@/lib/phoneMatch'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase not configured: missing SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key)
}

// GET /api/leads — list leads, optionally filter by ?converted_job_id=<uuid>.
// The lead workspace uses this to find the source quote_request for a job
// when the user lands on /dashboard/leads/[job_id].
export async function GET(request: NextRequest) {
  const unauthorized = await requireApiAuth(request)
  if (unauthorized) return unauthorized

  const url = new URL(request.url)
  const convertedJobId = url.searchParams.get('converted_job_id')

  try {
    const supabase = getSupabaseAdmin()
    let query = supabase.from('quote_requests').select('*').order('created_at', { ascending: false })
    if (convertedJobId) query = query.eq('converted_job_id', convertedJobId)
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

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiAuth(request)
  if (unauthorized) return unauthorized

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
      site_visit_at,
      site_visit_notes,
      answers = {},
      customer_id,
      address,
      city,
      state,
      zip,
    } = body

    if (!client_name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (!project_type) {
      return NextResponse.json({ error: 'Project type is required' }, { status: 400 })
    }

    // An explicit customer_id (e.g. "New Lead" launched from a customer page)
    // wins outright — no email/phone matching, so a typo can't fork off a
    // duplicate customer. Validate it points at a real customer first, so a
    // stale/bad id can't attach the lead to a dangling reference. (Single-
    // tenant app: every authenticated staff user shares one customer set, so
    // existence — not ownership — is the check that matters.) Falls back to
    // find-or-create when absent.
    let customerId: string | null = null
    if (customer_id) {
      const { data: owned } = await supabase
        .from('customers')
        .select('id')
        .eq('id', customer_id)
        .maybeSingle()
      if (!owned) {
        return NextResponse.json({ error: 'Invalid customer' }, { status: 400 })
      }
      customerId = owned.id
    }

    if (!customerId && client_email) {
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .ilike('email', client_email)
        .limit(1)
        .single()
      if (existing) customerId = existing.id
    }

    if (!customerId && client_phone) {
      // Digits-based match so a hand-typed "(617) 555-1234" links to the
      // customer stored as "+16175551234" instead of forking a duplicate.
      const match = await findCustomerByPhone(supabase, client_phone)
      if (match) customerId = match.id
    }

    let createdNewCustomer = false
    if (!customerId) {
      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          name: client_name,
          email: client_email || null,
          phone: client_phone || null,
          address: address || null,
          city: city || null,
          state: state || null,
          zip: zip || null,
          source: 'manual',
        })
        .select('id')
        .single()
      if (customerError) {
        // A concurrent request may have created the same customer between our
        // lookup above and this insert. On a unique violation, re-run the
        // email/phone lookup and link to the customer that won the race
        // rather than silently dropping the link (customer_id = null).
        if (customerError.code === '23505') {
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
            const match = await findCustomerByPhone(supabase, client_phone)
            if (match) customerId = match.id
          }
        } else {
          console.error('Customer create error:', customerError.message)
          return NextResponse.json({ error: customerError.message }, { status: 500 })
        }
      } else if (newCustomer) {
        customerId = newCustomer.id
        createdNewCustomer = true
      }
    }

    // For an existing customer, fill in any address field they're missing
    // rather than overwriting one that's already on file.
    if (customerId && !createdNewCustomer && (address || city || state || zip)) {
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('address, city, state, zip')
        .eq('id', customerId)
        .maybeSingle()

      if (existingCustomer) {
        const patch: Record<string, string> = {}
        if (address && !existingCustomer.address) patch.address = address
        if (city && !existingCustomer.city) patch.city = city
        if (state && !existingCustomer.state) patch.state = state
        if (zip && !existingCustomer.zip) patch.zip = zip
        if (Object.keys(patch).length > 0) {
          await supabase.from('customers').update(patch).eq('id', customerId)
        }
      }
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
        site_visit_at: site_visit_at || null,
        site_visit_notes: site_visit_notes || null,
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
