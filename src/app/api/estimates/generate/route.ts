import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireApiAuth, currentActorId } from '@/lib/apiAuth'
import { recordEstimateVersion } from '@/lib/estimateVersions'
import { generateEstimate } from '@/lib/estimator'
import type {
  MaterialCatalogRow,
  LaborRateRow,
  OperatingCostRow,
  JobTemplateRow,
} from '@/lib/estimator'
import { generateFromScopes, type JobScope, type ScopedTemplate } from '@/lib/estimator/scopes'
import { milesFromRevere } from '@/lib/geocode'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Accepts two body shapes:
//
//  1. New (multi-scope):
//     { job_id, scopes: [{label, template_name, sqft?, addons?, customer_provides?}, ...],
//       warranty_years?, overwrite? }
//
//  2. Legacy (single template, kept so existing callers keep working):
//     { job_id, template_name, sqft?, customer_provides?, warranty_years?, overwrite? }
//     — internally coerced to a single-scope request.
interface ScopeBody {
  id?: string
  label?: string
  template_name: string
  sqft?: number | null
  // Per-area sqft for templates that price by region (walk-in showers,
  // tub combos). Keys come from job_templates.sub_areas — typically
  // walls / shower_floor / outside_floor / floor.
  sub_sqft?: Record<string, number>
  addons?: Record<string, boolean | number>
  customer_provides?: string[]
}

interface GenerateBody {
  job_id: string
  scopes?: ScopeBody[]
  template_name?: string
  sqft?: number | null
  sub_sqft?: Record<string, number>
  customer_provides?: string[]
  warranty_years?: number
  overwrite?: boolean
  // Which quote option to price (migration 048). Omit for the normal
  // single-option job — the primary option is targeted and jobs.* is written
  // exactly as before. Naming a NON-primary option re-prices that variant
  // only, leaving the job (and therefore the Stripe deposit) untouched.
  option_key?: string | null
  // Optional manual override of miles from Revere base to the jobsite.
  // When omitted, the route geocodes the customer/job address and falls
  // back to the operating_costs minimum if that fails.
  transportation_miles_one_way?: number | null
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireApiAuth(req)
  if (unauthorized) return unauthorized

  let body: GenerateBody
  try {
    body = (await req.json()) as GenerateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.job_id) {
    return NextResponse.json({ error: 'job_id required' }, { status: 400 })
  }

  // Normalize: legacy single-template body → one-scope body. Either way we
  // end up with a non-empty scopes array.
  const scopesInput: ScopeBody[] = Array.isArray(body.scopes) && body.scopes.length > 0
    ? body.scopes
    : body.template_name
      ? [{
          template_name: body.template_name,
          label: body.template_name,
          sqft: body.sqft ?? null,
          sub_sqft: body.sub_sqft,
          customer_provides: body.customer_provides,
        }]
      : []

  if (scopesInput.length === 0) {
    return NextResponse.json(
      { error: 'Provide either scopes[] or template_name' },
      { status: 400 }
    )
  }

  const supabase = getSupabase()

  // Pull the unique template names this request needs so we can filter the
  // templates query (avoids loading all templates for a one-template estimate).
  const requestedTemplates = Array.from(new Set(scopesInput.map((s) => s.template_name)))

  const [jobRes, templatesRes, catalogRes, laborRes, costsRes, defaultsRes] = await Promise.all([
    supabase.from('jobs').select('*').eq('id', body.job_id).single(),
    supabase
      .from('job_templates')
      .select('template_name, job_type, typical_sqft_low, typical_sqft_high, demo_days, install_days, typical_materials, materials_formula, labor_formula, sub_areas, addons, customer_provides_default')
      .in('template_name', requestedTemplates),
    supabase
      .from('materials_pricing')
      .select('id, item, category, your_cost, price_to_customer, unit, coverage, retail_link'),
    supabase.from('labor_rates').select('setting, value'),
    supabase.from('operating_costs').select('setting, value'),
    // Singleton row of canonical estimate text Vince edits in /dashboard/settings.
    // Snapshotted onto each job so per-job edits don't rewrite global defaults
    // and global edits don't retroactively rewrite already-sent estimates.
    supabase
      .from('estimate_defaults')
      .select('warranty_years, warranty_text, payment_terms_text, payment_methods, customer_provides_default')
      .eq('id', 1)
      .maybeSingle(),
  ])

  if (jobRes.error || !jobRes.data) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  const templates = (templatesRes.data ?? []) as ScopedTemplate[]
  const missing = requestedTemplates.filter((n) => !templates.find((t) => t.template_name === n))
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Template(s) not found: ${missing.join(', ')}` },
      { status: 404 }
    )
  }

  const job = jobRes.data

  // Which option is being priced? Absent (or naming the primary one) keeps the
  // original behaviour: write jobs.* and record a version from it. Naming a
  // secondary option switches to the payload path, which writes only that
  // option — so pricing "Premium" can't move the number Stripe reads.
  let targetOption: { option_key: string; is_primary: boolean; line_items: unknown } | null = null
  if (body.option_key) {
    const { data: opt } = await supabase
      .from('job_estimates')
      .select('option_key, is_primary, line_items')
      .eq('job_id', body.job_id)
      .eq('option_key', body.option_key)
      .eq('is_current', true)
      .maybeSingle()
    if (!opt) {
      return NextResponse.json(
        { error: `Option "${body.option_key}" not found on this job.` },
        { status: 404 }
      )
    }
    targetOption = opt
  }
  const writesToJob = !targetOption || targetOption.is_primary

  const existingItems = targetOption
    ? (targetOption.line_items as unknown[] | null)
    : (job.line_items as unknown[] | null)
  const hasExistingItems = Array.isArray(existingItems) && existingItems.length > 0
  if (hasExistingItems && !body.overwrite) {
    return NextResponse.json(
      {
        error: 'Job already has line items. Pass overwrite: true to replace.',
        existing_line_item_count: (existingItems as unknown[]).length,
      },
      { status: 409 }
    )
  }

  // Build the canonical scopes array (with ids and labels filled in).
  const scopes: JobScope[] = scopesInput.map((s, idx) => ({
    id: s.id ?? `scope_${String(idx + 1).padStart(2, '0')}`,
    label: s.label?.trim() || `${s.template_name} #${idx + 1}`,
    template_name: s.template_name,
    sqft: s.sqft ?? null,
    sub_sqft: s.sub_sqft,
    addons: s.addons,
    customer_provides: s.customer_provides,
  }))

  // ── Transportation distance: prefer caller's explicit override, else
  // try to geocode the job's address. Failure is silent — the engine
  // falls back to the operating_costs minimum.
  let transportMilesOneWay = body.transportation_miles_one_way ?? null
  if (transportMilesOneWay == null) {
    const candidate = job.client_address ?? null
    let address = candidate
    if (!address && job.customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('address, city, state, zip')
        .eq('id', job.customer_id)
        .single()
      if (customer?.address) {
        address = [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(', ')
      }
    }
    if (address) {
      transportMilesOneWay = await milesFromRevere(address)
    }
  }

  let result
  try {
    // Single-scope legacy bodies still go through generateEstimate so the
    // synthetic-formula fallback handles templates that haven't been migrated.
    // Multi-scope bodies require formulas (migration 022 backfilled them).
    if (scopes.length === 1 && !Array.isArray(body.scopes)) {
      result = generateEstimate(
        templates[0] as JobTemplateRow,
        (catalogRes.data ?? []) as MaterialCatalogRow[],
        (laborRes.data ?? []) as LaborRateRow[],
        (costsRes.data ?? []) as OperatingCostRow[],
        {
          sqft: scopes[0].sqft ?? null,
          sub_sqft: scopes[0].sub_sqft,
          customer_provides: scopes[0].customer_provides,
          warranty_years: body.warranty_years ?? defaultsRes?.data?.warranty_years ?? 3,
          transportation_miles_one_way: transportMilesOneWay,
        }
      )
    } else {
      result = generateFromScopes(
        scopes,
        templates,
        (catalogRes.data ?? []) as MaterialCatalogRow[],
        (laborRes.data ?? []) as LaborRateRow[],
        (costsRes.data ?? []) as OperatingCostRow[],
        {
          warranty_years: body.warranty_years ?? defaultsRes?.data?.warranty_years ?? 3,
          transportation_miles_one_way: transportMilesOneWay,
        }
      )
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Estimate generation failed' },
      { status: 422 }
    )
  }

  // Preserve material order-status across a re-generate. A line the crew
  // already marked ordered / received / on_site shouldn't silently reset to
  // 'needed' just because the estimate was re-priced (the regenerate would
  // otherwise wipe two weeks of purchasing progress). Match on section +
  // description; only carry forward a non-default status.
  if (hasExistingItems && Array.isArray(existingItems)) {
    const prevStatus = new Map<string, string>()
    for (const li of existingItems as Array<Record<string, unknown>>) {
      const status = li?.status as string | undefined
      if (li?.category === 'materials' && status && status !== 'needed') {
        const section = typeof li.section === 'string' ? li.section : ''
        prevStatus.set(`${section}::${li.description as string}`, status)
      }
    }
    if (prevStatus.size > 0) {
      for (const li of result.line_items) {
        if (li.category === 'materials') {
          const carried = prevStatus.get(`${li.section ?? ''}::${li.description}`)
          if (carried) li.status = carried as typeof li.status
        }
      }
    }
  }

  const defaults = defaultsRes?.data
  // Build customer_provides text. Priority order:
  //   1. Explicit per-scope customer_provides arrays (caller passed them)
  //   2. Per-template customer_provides_default text (joined for multi-scope)
  //   3. Existing job.customer_provides (preserve manual edits on regenerate)
  //   4. estimate_defaults.customer_provides_default (global fallback)
  const customerProvidesText = (() => {
    const explicit = new Set<string>()
    for (const s of scopes) for (const cp of s.customer_provides ?? []) explicit.add(cp)
    if (explicit.size > 0) return Array.from(explicit).join(', ')
    if (job.customer_provides) return job.customer_provides
    const perTemplate = templates
      .map((t) => (t as { customer_provides_default?: string }).customer_provides_default)
      .filter((t): t is string => !!t && t.length > 0)
    if (perTemplate.length > 0) return Array.from(new Set(perTemplate)).join('\n\n')
    return defaults?.customer_provides_default ?? null
  })()

  // Snapshot warranty + payment text only when the job doesn't already have
  // its own — so re-generates don't trample per-job edits Vince made earlier.
  const warrantyText = job.warranty_text ?? defaults?.warranty_text ?? null
  const paymentTermsText = job.payment_terms_text ?? defaults?.payment_terms_text ?? null
  const paymentMethods = job.payment_methods ?? defaults?.payment_methods ?? null

  const estimatePayload = {
    line_items: result.line_items,
    scope_notes: result.scope_notes,
    scopes: scopes,
    estimated_cost: result.total,
    estimated_days: Math.max(1, Math.round(result.labor_days)),
    margin_percent: result.margin_percent,
    customer_provides: customerProvidesText,
    warranty_text: warrantyText,
    payment_terms_text: paymentTermsText,
    payment_methods: paymentMethods,
  }

  // The primary option (and every single-option job) writes straight to jobs.*
  // as it always has. A secondary option skips this entirely and is written
  // through the RPC payload path below, so re-pricing "Premium" never disturbs
  // the job the Stripe deposit and work order read from.
  let updated = job
  if (writesToJob) {
    const { data, error: updateError } = await supabase
      .from('jobs')
      .update(estimatePayload)
      .eq('id', body.job_id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
    updated = data
  }

  // Capture the revision (migration 048). Until this existed, the write above
  // destroyed the prior estimate outright — a re-price left no record of what
  // the customer had previously been quoted.
  //
  // coalesce_seconds: 0 — a re-generate is a deliberate act, not a nudge, so it
  // always earns its own version even if the last one was minutes ago.
  const version = await recordEstimateVersion(supabase, body.job_id, {
    optionKey: targetOption?.option_key ?? null,
    userId: await currentActorId(req),
    coalesceSeconds: 0,
    // When jobs.* was just written, the RPC reads it back (payload omitted).
    // Otherwise the freshly computed payload IS the source of truth.
    payload: writesToJob ? null : estimatePayload,
    changeNote: hasExistingItems
      ? `Re-priced — ${scopes.length} scope${scopes.length === 1 ? '' : 's'}, ${result.line_items.length} line items`
      : `Estimate generated — ${scopes.length} scope${scopes.length === 1 ? '' : 's'}`,
  })

  return NextResponse.json({
    job: updated,
    option_key: targetOption?.option_key ?? null,
    estimate_version: version?.version ?? null,
    summary: {
      total: result.total,
      deposit: result.deposit,
      labor_days: result.labor_days,
      margin_percent: result.margin_percent,
      line_item_count: result.line_items.length,
      scope_count: scopes.length,
      warnings: result.warnings,
    },
  })
}
