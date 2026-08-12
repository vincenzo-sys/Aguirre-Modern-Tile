import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireApiAuth, requireApiOwner, currentActorId } from '@/lib/apiAuth'
import { recordEstimateVersion, type JobEstimateVersion } from '@/lib/estimateVersions'

// Quote version history for one job (migration 048).
//
// GET  — the full revision list, newest first.
// POST — restore a previous revision.
//
// Auth split mirrors the rest of the dashboard: the whole team can READ the
// history (Christian benefits from seeing what a quote used to say), but only
// the owner can move the money, so restore is owner-only.

const MAX_VERSIONS = 50

// Full payload is returned per version rather than metadata-only. A job has a
// handful of revisions, and shipping line_items up front means the client can
// diff any pair instantly with diffEstimates() — no second round trip when
// Vince is standing in a customer's kitchen on a phone.
// Written as one literal (not concatenated) only because supabase-js infers row
// types from the select string — splitting it degrades every field to unknown.
const VERSION_COLUMNS =
  'id, job_id, option_key, label, blurb, sort_order, version, is_current, is_primary, selected_at, change_note, line_items, scopes, scope_notes, estimated_cost, estimated_days, margin_percent, customer_provides, warranty_text, payment_terms_text, payment_methods, created_by, created_at, updated_at'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  const { id } = await params

  try {
    const supabase = createServiceClient()
    const optionKey = req.nextUrl.searchParams.get('option_key')

    let query = supabase
      .from('job_estimates')
      .select(VERSION_COLUMNS)
      .eq('job_id', id)
      .order('created_at', { ascending: false })
      .limit(MAX_VERSIONS)

    if (optionKey) query = query.eq('option_key', optionKey)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const versions = (data ?? []) as unknown as JobEstimateVersion[]

    // Resolve authors in one round trip rather than relying on an implicit FK
    // join name, which is brittle across schema renames.
    const authorIds = Array.from(
      new Set(versions.map((v) => v.created_by).filter((v): v is string => !!v))
    )
    const authors = new Map<string, string>()
    if (authorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', authorIds)
      for (const p of profiles ?? []) {
        authors.set(p.id, p.full_name || p.email || 'Unknown')
      }
    }

    return NextResponse.json({
      versions: versions.map((v) => ({
        ...v,
        // null created_by means an X-API-Key caller (a script, not a person).
        author_name: v.created_by ? (authors.get(v.created_by) ?? 'Unknown') : 'Automation',
      })),
      truncated: versions.length === MAX_VERSIONS,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/jobs/[id]/estimate-versions — restore a previous revision.
//
// Restore is ADDITIVE: it copies the old payload back onto the job and records
// that as a NEW version. Nothing is rewound or deleted, so the fact that a
// restore happened is itself part of the history — which matters when a
// customer later asks why the price moved twice.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const forbidden = await requireApiOwner(req)
  if (forbidden) return forbidden

  const { id } = await params

  try {
    const supabase = createServiceClient()
    const body = await req.json().catch(() => ({}))
    const versionId = (body as { version_id?: string }).version_id

    if (!versionId) {
      return NextResponse.json({ error: 'version_id is required' }, { status: 400 })
    }

    const { data: snapshotRow, error: fetchErr } = await supabase
      .from('job_estimates')
      .select(VERSION_COLUMNS)
      .eq('id', versionId)
      .single()

    if (fetchErr || !snapshotRow) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 })
    }
    const snapshot = snapshotRow as unknown as JobEstimateVersion

    // Guard against restoring a version from a different job — the version id
    // is client-supplied, and without this a stale tab could write one
    // customer's pricing onto another customer's job.
    if (snapshot.job_id !== id) {
      return NextResponse.json(
        { error: 'That version belongs to a different job.' },
        { status: 400 }
      )
    }

    if (snapshot.is_current) {
      return NextResponse.json(
        { error: 'That version is already the current estimate.' },
        { status: 409 }
      )
    }

    // Restoring mirrors the payload onto jobs.*, which is only correct for the
    // option the job currently mirrors. Restoring a secondary option's history
    // arrives with the options UI.
    if (!snapshot.is_primary) {
      const { data: primary } = await supabase
        .from('job_estimates')
        .select('option_key')
        .eq('job_id', id)
        .eq('is_primary', true)
        .maybeSingle()

      if (primary && primary.option_key !== snapshot.option_key) {
        return NextResponse.json(
          {
            error:
              'That revision belongs to an option that is not the active one. Make it the active option first.',
          },
          { status: 409 }
        )
      }
    }

    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        line_items: snapshot.line_items,
        scopes: snapshot.scopes,
        scope_notes: snapshot.scope_notes,
        estimated_cost: snapshot.estimated_cost,
        estimated_days: snapshot.estimated_days,
        margin_percent: snapshot.margin_percent,
        customer_provides: snapshot.customer_provides,
        warranty_text: snapshot.warranty_text,
        payment_terms_text: snapshot.payment_terms_text,
        payment_methods: snapshot.payment_methods,
      })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    const version = await recordEstimateVersion(supabase, id, {
      optionKey: snapshot.option_key,
      userId: await currentActorId(req),
      coalesceSeconds: 0, // a restore is deliberate — always its own entry
      changeNote: `Restored v${snapshot.version}`,
    })

    return NextResponse.json({
      restored_from: snapshot.version,
      version: version?.version ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
