import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireApiOwner, currentActorId } from '@/lib/apiAuth'
import { recordEstimateVersion, type JobEstimateVersion } from '@/lib/estimateVersions'

// PATCH / DELETE a single quote option (migration 048).
//
// Three distinct jobs live in PATCH, because they are three things Vince does
// to the same object:
//   1. Rename / re-describe / reorder it   — metadata, no new version
//   2. Change its pricing                  — appends a version, mirrors to
//                                            jobs.* if this option is primary
//   3. Make it the active option           — promotes it onto jobs.*

const OPTION_COLUMNS =
  'id, job_id, option_key, label, blurb, sort_order, version, is_current, is_primary, selected_at, change_note, line_items, scopes, scope_notes, estimated_cost, estimated_days, margin_percent, customer_provides, warranty_text, payment_terms_text, payment_methods, created_by, created_at, updated_at'

/** Estimate fields a client may write to an option. */
const PAYLOAD_FIELDS = [
  'line_items',
  'scopes',
  'scope_notes',
  'estimated_cost',
  'estimated_days',
  'customer_provides',
  'warranty_text',
  'payment_terms_text',
  'payment_methods',
] as const

async function loadOption(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
  optionId: string
): Promise<JobEstimateVersion | null> {
  const { data } = await supabase
    .from('job_estimates')
    .select(OPTION_COLUMNS)
    .eq('id', optionId)
    .eq('job_id', jobId) // scoping to the job blocks cross-job writes via a stale id
    .maybeSingle()
  return (data as unknown as JobEstimateVersion) ?? null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; optionId: string }> }
) {
  const forbidden = await requireApiOwner(req)
  if (forbidden) return forbidden

  const { id, optionId } = await params

  try {
    const supabase = createServiceClient()
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const option = await loadOption(supabase, id, optionId)
    if (!option) {
      return NextResponse.json({ error: 'Option not found' }, { status: 404 })
    }
    if (!option.is_current) {
      return NextResponse.json(
        { error: 'That is a historical revision, not the live option.' },
        { status: 409 }
      )
    }

    // ── 1. Metadata (no version — renaming "Upgraded" to "Premium" is not a
    // price revision and shouldn't clutter the history).
    const meta: Record<string, unknown> = {}
    if (typeof body.label === 'string' && body.label.trim()) meta.label = body.label.trim()
    if ('blurb' in body) meta.blurb = body.blurb ?? null
    if (typeof body.sort_order === 'number') meta.sort_order = body.sort_order

    if (Object.keys(meta).length > 0) {
      // Apply to every row of this option so the label stays consistent across
      // its history — otherwise old versions would still show the old name.
      const { error } = await supabase
        .from('job_estimates')
        .update(meta)
        .eq('job_id', id)
        .eq('option_key', option.option_key)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // ── 2. Pricing payload → a new version via the RPC, which mirrors onto
    // jobs.* when this option is the primary one.
    const payload: Record<string, unknown> = {}
    for (const f of PAYLOAD_FIELDS) if (f in body) payload[f] = body[f]

    let version: Awaited<ReturnType<typeof recordEstimateVersion>> = null
    if (Object.keys(payload).length > 0) {
      version = await recordEstimateVersion(supabase, id, {
        optionKey: option.option_key,
        userId: await currentActorId(req),
        changeNote: typeof body.change_note === 'string' ? body.change_note : 'Edited in the dashboard',
        payload,
      })
    }

    // ── 3. Promote. Done last so it picks up any pricing written above.
    if (body.make_primary === true) {
      const { error } = await supabase.rpc('set_primary_estimate_option', {
        p_job_id: id,
        p_option_key: option.option_key,
        p_selected: false, // an internal switch is not customer intent
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const updated = await loadOption(supabase, id, version?.estimateId ?? optionId)
    return NextResponse.json({ option: updated, version: version?.version ?? null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE — remove an option and its whole history.
//
// This is the one genuinely destructive operation in the feature, so it is
// fenced: never the last option, never the active one, and never one the
// customer has already chosen.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; optionId: string }> }
) {
  const forbidden = await requireApiOwner(req)
  if (forbidden) return forbidden

  const { id, optionId } = await params

  try {
    const supabase = createServiceClient()

    const option = await loadOption(supabase, id, optionId)
    if (!option) {
      return NextResponse.json({ error: 'Option not found' }, { status: 404 })
    }

    const { data: current } = await supabase
      .from('job_estimates')
      .select('option_key')
      .eq('job_id', id)
      .eq('is_current', true)

    if ((current ?? []).length <= 1) {
      return NextResponse.json(
        { error: 'A job needs at least one option — this is the only one.' },
        { status: 409 }
      )
    }

    if (option.selected_at) {
      return NextResponse.json(
        { error: 'The customer already chose this option — it can\'t be deleted.' },
        { status: 409 }
      )
    }

    // Which option jobs.* mirrors is plumbing, not a decision the owner should
    // have to make — so deleting the mirrored one hands that role to a survivor
    // instead of refusing. Otherwise "make another option active first" would
    // be a rule about a concept the UI deliberately hides.
    if (option.is_primary) {
      const successor = (current ?? []).find((o) => o.option_key !== option.option_key)
      if (successor) {
        const { error: promoteErr } = await supabase.rpc('set_primary_estimate_option', {
          p_job_id: id,
          p_option_key: successor.option_key,
          p_selected: false,
        })
        if (promoteErr) {
          return NextResponse.json({ error: promoteErr.message }, { status: 500 })
        }
      }
    }

    const { error } = await supabase
      .from('job_estimates')
      .delete()
      .eq('job_id', id)
      .eq('option_key', option.option_key)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ deleted: option.option_key })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
