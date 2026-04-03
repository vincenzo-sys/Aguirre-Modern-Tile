import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchAllNotionJobs, type NotionJobPage } from '@/lib/notion'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Sync secret to prevent unauthorized calls
const SYNC_SECRET = process.env.SYNC_SECRET || 'dev-sync-secret'

export const maxDuration = 60

// POST /api/sync/notion — Pull all jobs from Notion, upsert into Supabase
export async function POST(req: NextRequest) {
  // Verify authorization
  const authHeader = req.headers.get('authorization')
  const body = await req.json().catch(() => ({}))
  const secret = authHeader?.replace('Bearer ', '') || body.secret

  if (secret !== SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Fetch all jobs from Notion
    const notionJobs = await fetchAllNotionJobs()

    let synced = 0
    let customersCreated = 0
    let errors: string[] = []

    for (const nj of notionJobs) {
      try {
        // 2. Find or create customer
        let customerId: string | null = null

        if (nj.client_name && nj.client_name !== 'Unknown') {
          // Try to find existing customer by email or phone
          if (nj.client_email) {
            const { data: existing } = await supabaseAdmin
              .from('customers')
              .select('id')
              .ilike('email', nj.client_email)
              .limit(1)
              .single()
            if (existing) customerId = existing.id
          }

          if (!customerId && nj.client_phone) {
            const { data: existing } = await supabaseAdmin
              .from('customers')
              .select('id')
              .eq('phone', nj.client_phone)
              .limit(1)
              .single()
            if (existing) customerId = existing.id
          }

          // Create new customer if not found
          if (!customerId) {
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
                notion_page_id: nj.notion_page_id,
              })
              .select('id')
              .single()

            if (newCust) {
              customerId = newCust.id
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
          estimated_cost: nj.quote_amount ?? nj.final_amount,
          actual_cost: nj.actual_cost,
          amount_paid: nj.amount_paid ?? 0,
          amount_invoiced: nj.final_amount ?? nj.quote_amount ?? 0,
          notes: nj.notes,
          notion_page_id: nj.notion_page_id,
          notion_last_synced_at: new Date().toISOString(),
          line_items: [],
        }

        if (existingJob) {
          // Update existing job
          await supabaseAdmin
            .from('jobs')
            .update(jobData)
            .eq('id', existingJob.id)
        } else {
          // Insert new job
          await supabaseAdmin
            .from('jobs')
            .insert(jobData)
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
