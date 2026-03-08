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

// GET /api/invoices - list all invoices with job data
export async function GET() {
  try {
    const supabase = await getSupabase()

    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    // Fetch associated jobs
    const jobIds = Array.from(new Set((invoices ?? []).map((i: { job_id: string }) => i.job_id)))
    let jobMap: Record<string, unknown> = {}

    if (jobIds.length > 0) {
      const { data: jobs } = await supabase
        .from('jobs')
        .select('*')
        .in('id', jobIds)

      for (const job of jobs ?? []) {
        jobMap[(job as { id: string }).id] = job
      }
    }

    const invoicesWithJobs = (invoices ?? []).map((inv: { job_id: string }) => ({
      ...inv,
      job: jobMap[inv.job_id] || null,
    }))

    return NextResponse.json(invoicesWithJobs)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/invoices - create a new invoice
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase()
    const body = await req.json()
    const { job_id, due_date, line_items } = body

    if (!job_id || !due_date || !line_items?.length) {
      return NextResponse.json(
        { error: 'job_id, due_date, and line_items are required' },
        { status: 400 }
      )
    }

    const amount = line_items.reduce(
      (sum: number, item: { amount: number }) => sum + item.amount,
      0
    )

    // Generate invoice number: INV-YYYY-NNN
    const year = new Date().getFullYear()
    const { count } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })

    const num = ((count ?? 0) + 1).toString().padStart(3, '0')
    const invoice_number = `INV-${year}-${num}`

    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert({
        job_id,
        invoice_number,
        amount,
        status: 'draft',
        due_date,
        line_items,
      })
      .select()
      .single()

    if (error) throw error

    // Update job's amount_invoiced
    const { data: jobInvoices } = await supabase
      .from('invoices')
      .select('amount')
      .eq('job_id', job_id)

    const totalInvoiced = (jobInvoices ?? []).reduce(
      (sum: number, inv: { amount: number }) => sum + Number(inv.amount),
      0
    )

    await supabase
      .from('jobs')
      .update({ amount_invoiced: totalInvoiced })
      .eq('id', job_id)

    return NextResponse.json(invoice, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
