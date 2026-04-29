import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/public/estimates/[token]
// Public — no auth. Returns sanitized estimate data for a shareable URL.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const supabase = createServiceClient()

    const { data: job, error } = await supabase
      .from('jobs')
      .select(
        'id, title, client_name, client_address, job_type, square_footage, scope_notes, customer_provides, line_items, estimated_cost, estimated_days, scheduled_start, amount_paid, estimate_accepted_at, estimate_viewed_at'
      )
      .eq('estimate_token', token)
      .single()

    if (error || !job) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }

    // Mark viewed on first open
    if (!job.estimate_viewed_at) {
      await supabase
        .from('jobs')
        .update({ estimate_viewed_at: new Date().toISOString() })
        .eq('id', job.id)
    }

    return NextResponse.json({
      title: job.title,
      client_name: job.client_name,
      client_address: job.client_address,
      job_type: job.job_type,
      square_footage: job.square_footage,
      scope_notes: job.scope_notes,
      customer_provides: job.customer_provides,
      line_items: job.line_items ?? [],
      estimated_cost: job.estimated_cost,
      deposit_amount: job.estimated_cost
        ? Math.round(Number(job.estimated_cost) * 0.1 * 100) / 100
        : 0,
      amount_paid: job.amount_paid ?? 0,
      accepted: !!job.estimate_accepted_at,
      accepted_at: job.estimate_accepted_at ?? null,
      already_viewed: !!job.estimate_viewed_at,
      scheduled_start: job.scheduled_start ?? null,
      estimated_days: job.estimated_days ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
