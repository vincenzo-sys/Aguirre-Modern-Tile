import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireApiAuth, requireApiOwner, currentActorId } from '@/lib/apiAuth'
import type { JobEstimateVersion } from '@/lib/estimateVersions'

// Quote OPTIONS for one job — the Good/Better/Best variants a customer picks
// between (migration 048).
//
// An "option" is the set of job_estimates rows sharing an option_key; the live
// one is the row with is_current. Exactly one option is is_primary, and that is
// the one mirrored onto jobs.* — so Stripe, invoicing and the crew work order
// keep reading the job and never need to know options exist.

const OPTION_COLUMNS =
  'id, job_id, option_key, label, blurb, sort_order, version, is_current, is_primary, selected_at, change_note, line_items, scopes, scope_notes, estimated_cost, estimated_days, margin_percent, customer_provides, warranty_text, payment_terms_text, payment_methods, created_by, created_at, updated_at'

/** Option keys are single letters — short, stable, and readable in a URL. */
function nextOptionKey(taken: string[]): string {
  for (let i = 0; i < 26; i++) {
    const k = String.fromCharCode(97 + i)
    if (!taken.includes(k)) return k
  }
  throw new Error('Out of option keys — 26 options on one job is not a real scenario.')
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  const { id } = await params

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('job_estimates')
      .select(OPTION_COLUMNS)
      .eq('job_id', id)
      .eq('is_current', true)
      .order('sort_order', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ options: (data ?? []) as unknown as JobEstimateVersion[] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/jobs/[id]/estimate-options — add an option.
//
// Defaults to DUPLICATING the current primary rather than starting blank:
// nobody builds the Premium quote from scratch, they build it by taking the
// standard one and swapping the tile. The copy is a fresh option at version 1,
// so its own history starts clean.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const forbidden = await requireApiOwner(req)
  if (forbidden) return forbidden

  const { id } = await params

  try {
    const supabase = createServiceClient()
    const body = (await req.json().catch(() => ({}))) as {
      label?: string
      blurb?: string | null
      copy_from_option_key?: string | null
      blank?: boolean
    }

    const label = (body.label ?? '').trim()
    if (!label) {
      return NextResponse.json({ error: 'label is required' }, { status: 400 })
    }

    const { data: existingRaw } = await supabase
      .from('job_estimates')
      .select(OPTION_COLUMNS)
      .eq('job_id', id)
      .eq('is_current', true)
    const existing = (existingRaw ?? []) as unknown as JobEstimateVersion[]

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Price this job once before adding a second option.' },
        { status: 409 }
      )
    }

    if (existing.some((o) => o.label.toLowerCase() === label.toLowerCase())) {
      return NextResponse.json(
        { error: `There is already an option called "${label}".` },
        { status: 409 }
      )
    }

    const source = body.blank
      ? null
      : (existing.find((o) => o.option_key === body.copy_from_option_key) ??
        existing.find((o) => o.is_primary) ??
        existing[0])

    const optionKey = nextOptionKey(existing.map((o) => o.option_key))
    const sortOrder = Math.max(...existing.map((o) => o.sort_order), -1) + 1

    const { data: created, error } = await supabase
      .from('job_estimates')
      .insert({
        job_id: id,
        option_key: optionKey,
        label,
        blurb: body.blurb ?? null,
        sort_order: sortOrder,
        version: 1,
        is_current: true,
        // A new option is never primary — adding "Premium" must not silently
        // re-price the job the rest of the system reads.
        is_primary: false,
        change_note: source ? `Created from "${source.label}"` : 'Created blank',
        line_items: source?.line_items ?? [],
        scopes: source?.scopes ?? [],
        scope_notes: source?.scope_notes ?? null,
        estimated_cost: source?.estimated_cost ?? null,
        estimated_days: source?.estimated_days ?? null,
        margin_percent: source?.margin_percent ?? null,
        customer_provides: source?.customer_provides ?? null,
        warranty_text: source?.warranty_text ?? null,
        payment_terms_text: source?.payment_terms_text ?? null,
        payment_methods: source?.payment_methods ?? null,
        created_by: await currentActorId(req),
      })
      .select(OPTION_COLUMNS)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ option: created as unknown as JobEstimateVersion }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
