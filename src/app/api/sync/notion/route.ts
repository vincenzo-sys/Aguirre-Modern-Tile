import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { fetchAllNotionJobs, type NotionJobPage } from '@/lib/notion'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Sync secret to prevent unauthorized calls (no fallback — must be configured)
const SYNC_SECRET = process.env.SYNC_SECRET

// Constant-time secret comparison. timingSafeEqual throws on length mismatch,
// so unequal lengths are treated as a non-match (unauthorized).
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export const maxDuration = 60

// ── Customer de-duplication ────────────────────────────────────────────
//
// customers only has PARTIAL unique indexes (migration 001):
//     UNIQUE (LOWER(email)) WHERE email IS NOT NULL
//     UNIQUE (phone)        WHERE phone IS NOT NULL
// A row with BOTH null is invisible to the database's own dedupe. A Notion page
// with no Phone and no Email therefore used to fall through to a bare INSERT on
// every job and every run — that is how "Aaron" collected three customer rows.
//
// Matching rules, strongest first:
//   1. phone, compared digits-only on the right-most 10 (so "(978) 423-4275"
//      matches "9784234275"). The old code used .eq() on the raw string and
//      missed every reformatted number.
//   2. email, case-insensitive exact.
//   3. name — ONLY when the page has no phone AND no email, and ONLY when
//      exactly one existing customer matches. Two different "John Smith"s must
//      never be fused: a duplicate is annoying, a wrong merge is unrecoverable.

type CustomerLite = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  address: string | null
}

const last10 = (p: string | null | undefined): string | null => {
  const d = (p || '').replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : null
}

// Collapse "Aaron", "Aaron ", "Aaron (GC)", "Aaron (gc)" onto one key.
const normName = (n: string | null | undefined): string =>
  (n || '')
    .toLowerCase()
    .replace(/\((?:gc|g\.c\.|general contractor)\)/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Names too generic to ever be a dedupe key.
const UNMATCHABLE_NAMES = new Set(['', 'unknown', 'n a', 'customer', 'client'])

function matchCustomer(
  cache: CustomerLite[],
  name: string | null,
  email: string | null,
  phone: string | null
): { id: string | null; how: string } {
  const p10 = last10(phone)
  if (p10) {
    const hit = cache.find((c) => last10(c.phone) === p10)
    if (hit) return { id: hit.id, how: 'phone' }
  }

  if (email) {
    const target = email.trim().toLowerCase()
    const hit = cache.find((c) => (c.email || '').trim().toLowerCase() === target)
    if (hit) return { id: hit.id, how: 'email' }
  }

  // Name fallback only for records with nothing stronger to match on.
  if (!p10 && !email && name) {
    const key = normName(name)
    if (key && !UNMATCHABLE_NAMES.has(key)) {
      const hits = cache.filter((c) => normName(c.name) === key)
      if (hits.length === 1) return { id: hits[0].id, how: 'name' }
      if (hits.length > 1) return { id: null, how: `ambiguous-name:${hits.length}` }
    }
  }

  return { id: null, how: 'no-match' }
}

// POST /api/sync/notion — Pull all jobs from Notion, upsert into Supabase
export async function POST(req: NextRequest) {
  // Verify authorization
  const authHeader = req.headers.get('authorization')
  const body = await req.json().catch(() => ({}))
  const secret = authHeader?.replace('Bearer ', '') || body.secret

  // Server must be configured with a sync secret — no fallback allowed
  if (!SYNC_SECRET) {
    return NextResponse.json(
      { error: 'Server misconfigured: SYNC_SECRET is not set' },
      { status: 500 }
    )
  }

  if (typeof secret !== 'string' || !secretsMatch(secret, SYNC_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabaseAdmin = getSupabaseAdmin()

    // 1. Fetch all jobs from Notion
    const notionJobs = await fetchAllNotionJobs()

    // Read every customer ONCE. Newly created customers get pushed onto this
    // cache, so two Notion jobs for the same brand-new customer inside a single
    // run reuse the first row instead of inserting a second one. (That is
    // literally what happened to "Aaron": two rows, 62 seconds apart, one run.)
    const { data: customerRows } = await supabaseAdmin
      .from('customers')
      .select('id, name, email, phone, address')
      .limit(5000)
    const customerCache: CustomerLite[] = customerRows ?? []

    let synced = 0
    let customersCreated = 0
    let errors: string[] = []
    let ambiguous: string[] = []

    for (const nj of notionJobs) {
      try {
        // 2. Find or create customer
        let customerId: string | null = null

        if (nj.client_name && nj.client_name !== 'Unknown') {
          const { id, how } = matchCustomer(
            customerCache,
            nj.client_name,
            nj.client_email,
            nj.client_phone
          )
          customerId = id

          if (customerId) {
            // Backfill contact details the existing row is missing, so next run
            // this customer matches on a strong key instead of on name. Safe
            // against the unique indexes: we only reach here after failing to
            // find anyone by this email/phone, so nobody else holds them.
            const existing = customerCache.find((c) => c.id === customerId)!
            const patch: Partial<CustomerLite> = {}
            if (!existing.email && nj.client_email) patch.email = nj.client_email
            if (!existing.phone && nj.client_phone) patch.phone = nj.client_phone
            if (!existing.address && nj.client_address) patch.address = nj.client_address
            if (Object.keys(patch).length > 0) {
              await supabaseAdmin.from('customers').update(patch).eq('id', customerId)
              Object.assign(existing, patch)
            }
          } else if (how.startsWith('ambiguous-name')) {
            // Several customers share this name and the page has no phone or
            // email to break the tie. Creating another row is the exact bug this
            // guard exists to stop — leave the job unlinked and report it.
            ambiguous.push(`${nj.title} (client "${nj.client_name}", ${how})`)
          } else {
            const { data: newCust } = await supabaseAdmin
              .from('customers')
              .insert({
                name: nj.client_name,
                email: nj.client_email,
                phone: nj.client_phone,
                address: nj.client_address,
                source: nj.lead_source === 'Referral' ? 'referral'
                  : nj.lead_source === 'Repeat Customer' ? 'repeat'
                  : nj.lead_source === 'Google' || nj.lead_source === 'Instagram' || nj.lead_source === 'Facebook' ? 'website'
                  : 'manual',
                // NOTE: deliberately NOT setting notion_page_id here. It holds
                // the JOB page's id, not a customer page's — stamping it on the
                // customer row is wrong, and it made a customer look "linked" to
                // Notion when nothing could ever match it back.
              })
              .select('id, name, email, phone, address')
              .single()

            if (newCust) {
              customerId = newCust.id
              customerCache.push(newCust)
              customersCreated++
            }
          }
        }

        // 3. Check if job already exists by notion_page_id
        const { data: existingJob } = await supabaseAdmin
          .from('jobs')
          .select('id')
          .eq('notion_page_id', nj.notion_page_id)
          .limit(1)
          .single()

        // Notion-owned descriptive fields — safe to overwrite on every sync.
        // NOTE: line_items and the money fields (estimated_cost, amount_paid,
        // amount_invoiced) are intentionally excluded here so that updates to an
        // existing job never clobber dashboard-built estimates or payment state.
        const jobData = {
          title: nj.title,
          status: nj.status,
          customer_id: customerId,
          client_name: nj.client_name,
          client_phone: nj.client_phone,
          client_email: nj.client_email,
          client_address: nj.client_address,
          job_type: nj.job_type,
          square_footage: nj.square_footage,
          scope_notes: nj.scope_notes
            ? (nj.materials_responsibility ? `${nj.scope_notes}\n\nMaterials: ${nj.materials_responsibility}` : nj.scope_notes)
            : nj.materials_responsibility
              ? `Materials: ${nj.materials_responsibility}`
              : null,
          scheduled_start: nj.project_date_start,
          scheduled_end: nj.project_date_end,
          estimated_days: nj.estimated_days,
          actual_cost: nj.actual_cost,
          notes: nj.notes,
          notion_page_id: nj.notion_page_id,
          notion_last_synced_at: new Date().toISOString(),
        }

        if (existingJob) {
          // Update existing job — only refresh Notion-owned descriptive fields.
          // Omit line_items / estimated_cost / amount_paid / amount_invoiced to
          // preserve dashboard-built estimates and payment state.
          await supabaseAdmin
            .from('jobs')
            .update(jobData)
            .eq('id', existingJob.id)
        } else {
          // Insert new job — seed money fields and an empty line_items array.
          await supabaseAdmin
            .from('jobs')
            .insert({
              ...jobData,
              estimated_cost: nj.quote_amount ?? nj.final_amount,
              amount_paid: nj.amount_paid ?? 0,
              amount_invoiced: nj.final_amount ?? nj.quote_amount ?? 0,
              line_items: [],
            })
        }

        synced++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${nj.title}: ${msg}`)
      }
    }

    return NextResponse.json({
      success: true,
      total_notion_jobs: notionJobs.length,
      synced,
      customers_created: customersCreated,
      // Jobs left without a customer because the name matched more than one
      // record and the Notion page had no phone/email to disambiguate. Add a
      // Phone or Email to those pages, or link the job by hand.
      unlinked_ambiguous: ambiguous.length > 0 ? ambiguous : undefined,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Notion sync error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// GET /api/sync/notion — Status check
export async function GET() {
  const hasToken = !!process.env.NOTION_API_TOKEN
  const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL

  return NextResponse.json({
    status: hasToken && hasSupabase ? 'ready' : 'not_configured',
    notion_configured: hasToken,
    supabase_configured: hasSupabase,
  })
}
