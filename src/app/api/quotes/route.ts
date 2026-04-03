import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateContact, sanitize, rateLimit } from '@/lib/validation'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 submissions per minute per IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const limit = rateLimit(ip, { maxRequests: 5, windowMs: 60_000 })
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      )
    }

    const body = await req.json()
    const name = sanitize(body.name || '')
    const email = sanitize(body.email || '')
    const phone = sanitize(body.phone || '')
    const projectType = sanitize(body.projectType || '')

    // Server-side validation
    const errors = validateContact({ name, email, phone })
    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    if (!projectType) {
      return NextResponse.json({ error: 'Project type is required' }, { status: 400 })
    }

    // Sanitize answers
    const rawAnswers = body.answers as Record<string, string> | undefined
    const answers: Record<string, string> = {}
    if (rawAnswers && typeof rawAnswers === 'object') {
      for (const [k, v] of Object.entries(rawAnswers)) {
        if (typeof v === 'string') {
          answers[sanitize(k).slice(0, 100)] = sanitize(v)
        }
      }
    }

    // Save to Supabase if configured
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

      // Find or create customer record
      let customerId: string | null = null
      try {
        // Try email match first
        if (email) {
          const { data: existing } = await supabase
            .from('customers')
            .select('id')
            .ilike('email', email)
            .limit(1)
            .single()
          if (existing) customerId = existing.id
        }

        // Try phone match if no email match
        if (!customerId && phone) {
          const { data: existing } = await supabase
            .from('customers')
            .select('id')
            .eq('phone', phone)
            .limit(1)
            .single()
          if (existing) customerId = existing.id
        }

        // Create new customer if no match found
        if (!customerId) {
          const { data: newCustomer } = await supabase
            .from('customers')
            .insert({
              name,
              email: email || null,
              phone: phone || null,
              source: 'website',
            })
            .select('id')
            .single()
          if (newCustomer) customerId = newCustomer.id
        }
      } catch (err) {
        // Non-fatal: quote still saves even if customer creation fails
        console.error('Customer find-or-create error:', err)
      }

      const { data, error } = await supabase
        .from('quote_requests')
        .insert({
          client_name: name,
          client_email: email,
          client_phone: phone,
          project_type: projectType,
          answers,
          status: 'new',
          customer_id: customerId,
        })
        .select('id')
        .single()

      if (error) {
        console.error('Quote request save error:', error.message)
      }

      return NextResponse.json({ success: true, id: data?.id })
    }

    return NextResponse.json({ success: true, demo: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Quote API error:', message)
    return NextResponse.json({ error: 'Failed to save quote request' }, { status: 500 })
  }
}
