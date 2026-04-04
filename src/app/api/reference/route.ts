import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Valid table names for the reference data endpoints
const VALID_TABLES = [
  'materials_pricing',
  'labor_rates',
  'operating_costs',
  'add_ons',
  'job_templates',
  'trade_contacts',
] as const

type RefTable = (typeof VALID_TABLES)[number]

function isValidTable(table: string): table is RefTable {
  return VALID_TABLES.includes(table as RefTable)
}

// GET /api/reference?table=materials_pricing
// Returns all rows from the specified reference table
export async function GET(req: NextRequest) {
  const table = req.nextUrl.searchParams.get('table')

  if (!table || !isValidTable(table)) {
    return NextResponse.json(
      { error: `Invalid table. Must be one of: ${VALID_TABLES.join(', ')}` },
      { status: 400 }
    )
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// POST /api/reference?table=materials_pricing
// Create a new row in the specified reference table
export async function POST(req: NextRequest) {
  const table = req.nextUrl.searchParams.get('table')

  if (!table || !isValidTable(table)) {
    return NextResponse.json(
      { error: `Invalid table. Must be one of: ${VALID_TABLES.join(', ')}` },
      { status: 400 }
    )
  }

  const body = await req.json()

  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from(table)
    .insert(body)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/reference?table=materials_pricing&id=uuid
// Update a row in the specified reference table
export async function PATCH(req: NextRequest) {
  const table = req.nextUrl.searchParams.get('table')
  const id = req.nextUrl.searchParams.get('id')

  if (!table || !isValidTable(table)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
  }
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const body = await req.json()

  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from(table)
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// DELETE /api/reference?table=materials_pricing&id=uuid
export async function DELETE(req: NextRequest) {
  const table = req.nextUrl.searchParams.get('table')
  const id = req.nextUrl.searchParams.get('id')

  if (!table || !isValidTable(table)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
  }
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: true })
}
