import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiAuth } from '@/lib/apiAuth'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const VALID_TABLES = [
  'materials_pricing',
  'labor_rates',
  'operating_costs',
  'add_ons',
  'job_templates',
  'trade_contacts',
  'estimate_defaults',
] as const

// PATCH /api/reference/[table]/[id] — update a single reference row
// Used by the settings page inline editors. Auth: dashboard session or TILE_API_KEY.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  const { table, id } = await params
  if (!VALID_TABLES.includes(table as (typeof VALID_TABLES)[number])) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
  }

  try {
    const body = await req.json()
    const supabase = getSupabaseAdmin()

    // Enforce 20% markup floor on materials_pricing updates
    if (table === 'materials_pricing' && 'your_cost' in body && 'price_to_customer' in body) {
      const cost = Number(body.your_cost)
      const min = cost * 1.20
      if (Number(body.price_to_customer) < min) {
        body.price_to_customer = Number(min.toFixed(2))
        body.markup_percent = 0.20
      }
    }

    const { data, error } = await supabase
      .from(table)
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
