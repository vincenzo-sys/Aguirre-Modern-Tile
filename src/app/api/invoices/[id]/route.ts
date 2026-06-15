import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { /* Server Component context */ }
        },
      },
    }
  )
}

// PATCH /api/invoices/[id] - update invoice status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await getSupabase()
    const body = await req.json()
    const { status, line_items } = body

    const updates: Record<string, unknown> = {}

    if (status !== undefined) {
      const validStatuses = ['draft', 'sent', 'paid', 'overdue', 'void']
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      updates.status = status
    }

    // Allow appending/editing line items. Recompute the amount server-side so
    // the stored total always matches the items (never trust a client total).
    if (line_items !== undefined) {
      if (!Array.isArray(line_items) || line_items.length === 0) {
        return NextResponse.json(
          { error: 'line_items must be a non-empty array' },
          { status: 400 }
        )
      }
      updates.line_items = line_items
      updates.amount = line_items.reduce(
        (sum: number, item: { amount: number }) => sum + Number(item.amount || 0),
        0
      )
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const { data: invoice, error } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Recalculate the job's financial totals whenever the invoiced amount could
    // have changed: a status flip to paid/void, or an edit to the line items.
    if (invoice && (line_items !== undefined || status === 'paid' || status === 'void')) {
      const { data: jobInvoices } = await supabase
        .from('invoices')
        .select('amount, status')
        .eq('job_id', invoice.job_id)

      const activeInvoices = (jobInvoices ?? []).filter(
        (inv: { status: string }) => inv.status !== 'void'
      )

      const totalPaid = activeInvoices
        .filter((inv: { status: string }) => inv.status === 'paid')
        .reduce((sum: number, inv: { amount: number }) => sum + Number(inv.amount), 0)

      const totalInvoiced = activeInvoices
        .reduce((sum: number, inv: { amount: number }) => sum + Number(inv.amount), 0)

      await supabase
        .from('jobs')
        .update({
          amount_paid: totalPaid,
          amount_invoiced: totalInvoiced,
        })
        .eq('id', invoice.job_id)
    }

    return NextResponse.json(invoice)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
