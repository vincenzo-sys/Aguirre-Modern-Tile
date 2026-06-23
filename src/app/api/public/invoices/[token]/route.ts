import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/public/invoices/[token]
// Public — no auth. Returns sanitized invoice data for a shareable URL.
// Mirrors /api/public/estimates/[token]. NEVER returns cost/margin or any
// internal pricing — only the customer-facing invoice fields.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const supabase = createServiceClient()

    const { data: invoice, error } = await supabase
      .from('invoices')
      .select(
        'id, invoice_number, amount, status, due_date, line_items, stripe_hosted_url, job_id, created_at'
      )
      .eq('public_token', token)
      .single()

    if (error || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Bill-to details come from the associated job (denormalized client_* fields).
    let client_name: string | null = null
    let client_address: string | null = null
    let job_title: string | null = null
    if (invoice.job_id) {
      const { data: job } = await supabase
        .from('jobs')
        .select('title, client_name, client_address')
        .eq('id', invoice.job_id)
        .single()
      if (job) {
        client_name = job.client_name ?? null
        client_address = job.client_address ?? null
        job_title = job.title ?? null
      }
    }

    return NextResponse.json({
      invoice_number: invoice.invoice_number,
      job_title,
      client_name,
      client_address,
      line_items: invoice.line_items ?? [],
      amount: Number(invoice.amount) || 0,
      status: invoice.status,
      due_date: invoice.due_date,
      // Only expose a pay URL while the invoice is still payable.
      pay_url:
        invoice.status === 'sent' || invoice.status === 'overdue'
          ? invoice.stripe_hosted_url ?? null
          : null,
      paid: invoice.status === 'paid',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
