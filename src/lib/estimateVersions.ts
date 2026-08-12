import type { SupabaseClient } from '@supabase/supabase-js'
import type { JobLineItem } from '@/lib/supabase/types'
import type { JobScope } from '@/lib/estimator/scopes'
import { diffEstimates, type EstimateSnapshot } from '@/lib/estimator/diffEstimates'

// Quote version history — the app-side entry point to migration 048.
//
// Background: an estimate IS a jobs row in this system. /api/estimates/generate
// overwrites jobs.line_items in place, and so does every PATCH /api/jobs/[id]
// that touches line_items, so before 048 the previous estimate was destroyed on
// every edit and "what changed since last week?" was unanswerable.
//
// job_estimates fixes that by keeping an append-only copy beside the job. This
// module is called AFTER a successful mutation to jobs, so the sequence of rows
// IS the history — there is no snapshot-before/snapshot-after ordering to get
// wrong, and a mutation that fails simply never records a version.
//
// The heavy lifting (coalescing, primacy handoff, the two partial unique
// indexes) lives in the record_job_estimate_version plpgsql function, because
// demoting the old row and inserting the new one must commit together. Same
// reasoning as record_deposit in migration 045.

/**
 * One row of job_estimates as served by /api/jobs/[id]/estimate-versions.
 *
 * It is both an OPTION (rows sharing option_key are one option) and a VERSION
 * (successive `version` numbers within that option) — the two features share a
 * shape because both are "a frozen copy of a quote's numbers plus a label".
 */
export interface JobEstimateVersion {
  id: string
  job_id: string
  option_key: string
  label: string
  blurb: string | null
  sort_order: number
  version: number
  is_current: boolean
  is_primary: boolean
  selected_at: string | null
  change_note: string | null
  line_items: JobLineItem[]
  scopes: JobScope[] | null
  scope_notes: string | null
  estimated_cost: number | string | null
  estimated_days: number | null
  /** INTERNAL — must never be forwarded to the public estimate page. */
  margin_percent: number | string | null
  customer_provides: string | null
  warranty_text: string | null
  payment_terms_text: string | null
  payment_methods: string[] | null
  created_by: string | null
  created_at: string
  updated_at: string
  /** Resolved server-side from profiles; 'Automation' for API-key writes. */
  author_name?: string
}

/**
 * The job columns that make up a customer-facing estimate. A PATCH that touches
 * any of these has changed the quote and should produce a version; a PATCH that
 * only moves `status` or `assigned_to` has not.
 */
export const ESTIMATE_FIELDS = [
  'line_items',
  'scope_notes',
  'estimated_cost',
  'estimated_days',
  'customer_provides',
  'warranty_text',
  'payment_terms_text',
  'payment_methods',
] as const

/** True when the given update payload changes anything the customer would see priced. */
export function touchesEstimate(updates: Record<string, unknown>): boolean {
  return ESTIMATE_FIELDS.some((f) => f in updates)
}

/** The narrative fields that belong to the estimate but carry no numbers. */
const TEXT_FIELDS = [
  'scope_notes',
  'customer_provides',
  'warranty_text',
  'payment_terms_text',
] as const

/**
 * Did this write actually change the quote?
 *
 * touchesEstimate only asks whether line_items was in the payload — and it
 * always is when the crew flips a material from 'needed' to 'ordered', because
 * purchasing status is stored inside the same JSONB array. Versioning on that
 * would bury real price revisions under a pile of entries whose diff is empty.
 *
 * diffEstimates already ignores status and the internal source_url breadcrumbs
 * for exactly this reason, so the numeric side is just "is the diff empty?".
 * The text fields are compared here because they live on the job, not in the
 * line items.
 */
export function estimateMeaningfullyChanged(
  before: EstimateSnapshot & Record<string, unknown>,
  after: EstimateSnapshot & Record<string, unknown>
): boolean {
  if (!diffEstimates(before, after).isEmpty) return true
  if (TEXT_FIELDS.some((f) => (before[f] ?? null) !== (after[f] ?? null))) return true
  return JSON.stringify(before.payment_methods ?? null) !== JSON.stringify(after.payment_methods ?? null)
}

export interface RecordVersionOptions {
  /** Which option to version. Omit to target whichever option is currently primary. */
  optionKey?: string | null
  /** Short human note explaining the revision, surfaced in the history list. */
  changeNote?: string | null
  /** profiles.id of whoever made the change. null for X-API-Key callers. */
  userId?: string | null
  /**
   * Coalescing window. Consecutive edits by the same actor inside this many
   * seconds fold into the current version instead of branching a new one, so a
   * burst of small tweaks reads as one revision. Pass 0 to force a new version
   * (used by an explicit re-generate, which is a deliberate act, not a nudge).
   * Never applies across a send — see the SQL.
   */
  coalesceSeconds?: number
  /**
   * Explicit estimate payload. Omit for the normal flow, where the caller has
   * already written to `jobs` and this just records what landed.
   *
   * Supplying it inverts the direction: the payload becomes the source and is
   * mirrored onto `jobs` only if the target option is the primary one. That is
   * what lets a secondary option (the "Upgraded" quote) be re-priced without
   * moving the number Stripe and invoicing read off the job. Only the keys
   * present are applied.
   */
  payload?: Record<string, unknown> | null
}

export interface RecordVersionResult {
  estimateId: string
  version: number
  coalesced: boolean
}

/**
 * Append (or coalesce into) a version capturing the job's current estimate.
 *
 * Never throws. Version history is a secondary record: if capturing it fails,
 * the estimate save that just succeeded must still be reported as a success,
 * because failing the user's save to protect the audit trail is strictly worse
 * than a gap in the audit trail. Failures are logged and returned as null.
 */
export async function recordEstimateVersion(
  supabase: SupabaseClient,
  jobId: string,
  opts: RecordVersionOptions = {}
): Promise<RecordVersionResult | null> {
  try {
    const { data, error } = await supabase.rpc('record_job_estimate_version', {
      p_job_id: jobId,
      p_option_key: opts.optionKey ?? null,
      p_change_note: opts.changeNote ?? null,
      p_created_by: opts.userId ?? null,
      p_coalesce_seconds: opts.coalesceSeconds ?? 600,
      p_payload: opts.payload ?? null,
    })

    if (error) {
      console.error(`[estimateVersions] record failed for job ${jobId}:`, error.message)
      return null
    }

    // The function RETURNS TABLE, so supabase-js hands back an array of rows.
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return null

    return {
      estimateId: row.estimate_id,
      version: row.estimate_version,
      coalesced: row.was_coalesced,
    }
  } catch (err) {
    console.error(
      `[estimateVersions] record threw for job ${jobId}:`,
      err instanceof Error ? err.message : err
    )
    return null
  }
}
