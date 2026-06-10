import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseScopeNotes } from '@/lib/scopeNotes'
import type { JobLineItem } from '@/lib/supabase/types'

// GET /api/public/work-orders/[token]
// Public — no auth. Crew-facing work order. Returns ONLY what the install
// team needs: who/where, scope, and materials. No pricing ever — the
// financial columns are not even SELECTed, so they can't leak.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const supabase = createServiceClient()

    // Deliberately narrow column list — estimated_cost, margin_percent,
    // amount_paid, payment_terms_text etc. are excluded on purpose.
    const { data: job, error } = await supabase
      .from('jobs')
      .select(
        'title, client_name, client_phone, client_address, job_type, square_footage, scope_notes, crew_instructions, customer_provides, scheduled_start, scheduled_end, line_items'
      )
      .eq('work_order_token', token)
      .single()

    if (error || !job) {
      return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
    }

    // Materials only — the crew is the labor, so labor lines (which carry
    // pricing) are dropped. Strip unit_price/amount from each material so
    // cost never reaches the client.
    const materials = ((job.line_items ?? []) as JobLineItem[])
      .filter((i) => i.category === 'materials')
      .map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        status: i.status ?? null,
        source_url: i.source_url ?? null,
        source_name: i.source_name ?? null,
        section: i.section ?? null,
      }))

    // Parse scope server-side and forward only the crew-relevant sections.
    // This keeps the PAYMENT section (which can reference deposit terms) out
    // of the response entirely.
    const scope = parseScopeNotes(job.scope_notes)

    return NextResponse.json({
      title: job.title,
      client_name: job.client_name,
      client_phone: job.client_phone ?? null,
      client_address: job.client_address ?? null,
      job_type: job.job_type ?? null,
      square_footage: job.square_footage ?? null,
      scheduled_start: job.scheduled_start ?? null,
      scheduled_end: job.scheduled_end ?? null,
      scope_of_work: scope.scopeOfWork || null,
      included: scope.included,
      not_included: scope.notIncluded,
      crew_instructions: job.crew_instructions ?? null,
      customer_provides: job.customer_provides ?? null,
      materials,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
