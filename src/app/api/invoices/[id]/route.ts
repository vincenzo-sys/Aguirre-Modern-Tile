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
    const { status } = body

    const validStatuses = ['draft', 'sent', 'paid', 'overdue', 'void']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const { data: invoice, error } = await supabase
      .from('invoices')
      .update({ status })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // If marking as paid or void, recalculate job financial totals
    if ((status === 'paid' || status === 'void') && invoice) {
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
          ...(status === 'void' ? { amount_invoiced: totalInvoiced } : {}),
        })
        .eq('id', invoice.job_id)
    }

    return NextResponse.json(invoice)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
