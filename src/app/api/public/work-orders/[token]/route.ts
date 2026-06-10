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
    // amount_paid, payment_terms_text etc. are excluded on purpose. `id` is
    // pulled for internal photo lookups below; it is not returned in the body.
    const { data: job, error } = await supabase
      .from('jobs')
      .select(
        'id, title, client_name, client_phone, client_address, job_type, square_footage, scope_notes, crew_instructions, customer_provides, scheduled_start, scheduled_end, line_items'
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

    // Site photos so the crew sees the space before they arrive. Two sources:
    // the customer's intake photos (quote_request_photos, bucket 'quote-photos')
    // and any jobsite/reference shots on the job (job_photos, bucket
    // 'job-photos'). Intake first — that's the existing space. Signed URLs
    // expire in 1h, which is fine: this page is rendered no-store so it mints
    // fresh URLs on every crew visit.
    const photos: { url: string; caption: string | null }[] = []

    async function signInto(
      bucket: string,
      rows: { storage_path: string; caption: string | null }[]
    ) {
      for (const row of rows) {
        const { data: signed } = await supabase.storage
          .from(bucket)
          .createSignedUrl(row.storage_path, 3600)
        if (signed?.signedUrl) photos.push({ url: signed.signedUrl, caption: row.caption ?? null })
      }
    }

    // Intake photos via the originating quote request (if this job came from one).
    const { data: qr } = await supabase
      .from('quote_requests')
      .select('id')
      .eq('converted_job_id', job.id)
      .maybeSingle()
    if (qr?.id) {
      const { data: intakePhotos } = await supabase
        .from('quote_request_photos')
        .select('storage_path, caption')
        .eq('quote_request_id', qr.id)
        .order('created_at', { ascending: true })
      await signInto('quote-photos', intakePhotos ?? [])
    }

    // Job photos (crew/reference shots attached directly to the job).
    const { data: jobPhotos } = await supabase
      .from('job_photos')
      .select('storage_path, caption')
      .eq('job_id', job.id)
      .order('created_at', { ascending: true })
    await signInto('job-photos', jobPhotos ?? [])

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
      photos,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
