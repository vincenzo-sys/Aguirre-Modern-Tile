import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, AUTO_MESSAGES, toE164 } from '@/lib/openphone'
import { postToDiscord, DISCORD_COLORS } from '@/lib/discord'

// Daily nurture cron. Runs at 8 AM ET (13:00 UTC) via vercel.json.
//
// Finds three buckets and acts on each:
//
//   1. Viewed-but-not-paid — estimate was opened 48h+ ago, never accepted,
//      fewer than 3 nudges sent so far, last nudge > 36h ago. Sends an SMS
//      follow-up via OpenPhone, increments follow_up_count, stamps
//      last_contact_at, and logs to message_log.
//
//   2. Stale quote_requests — no converted_job_id, no site visit scheduled,
//      older than 5 days. Surfaces in the Discord summary so Vince can
//      decide whether to follow up personally (or mark lost).
//
//   3. Morning queue — rows with next_contact_date <= today. Summary only,
//      no auto-action (those contacts are manual by design).
//
// Auth: requires the x-vercel-cron header (Vercel adds it automatically)
// OR a CRON_SECRET match (for manual triggering during testing).

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
  'https://www.aguirremoderntile.com'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function isAuthorized(req: NextRequest): boolean {
  // Vercel cron header
  if (req.headers.get('x-vercel-cron')) return true
  // Manual secret for testing
  const provided = req.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (expected && provided === `Bearer ${expected}`) return true
  return false
}

interface NudgeResult {
  job_id: string
  client_name: string
  phone: string
  nudge_number: number
  sms_ok: boolean
  error?: string
}

async function processNudges(
  supabase: ReturnType<typeof getSupabase>,
  dryRun: boolean
): Promise<NudgeResult[]> {
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const lastNudgeBefore = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString()

  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, client_name, client_phone, estimate_token, follow_up_count, customer_id')
    .not('estimate_viewed_at', 'is', null)
    .lt('estimate_viewed_at', twoDaysAgo)
    .is('estimate_accepted_at', null)
    .or('amount_paid.is.null,amount_paid.eq.0')
    .lt('follow_up_count', 3)
    .or(`last_contact_at.is.null,last_contact_at.lt.${lastNudgeBefore}`)
    .not('client_phone', 'is', null)
    .not('estimate_token', 'is', null)

  if (error || !jobs) return []

  const results: NudgeResult[] = []

  for (const job of jobs) {
    const phone = toE164(job.client_phone ?? '')
    if (!phone) {
      results.push({
        job_id: job.id,
        client_name: job.client_name,
        phone: job.client_phone ?? '',
        nudge_number: job.follow_up_count + 1,
        sms_ok: false,
        error: 'Could not normalize phone to E.164',
      })
      continue
    }

    const nudgeNumber = job.follow_up_count + 1
    const estimateUrl = `${SITE_URL}/estimates/${job.estimate_token}`
    const message = AUTO_MESSAGES.estimate_viewed_nudge(estimateUrl, nudgeNumber)

    const sms = dryRun
      ? { success: true as const, messageId: 'dry-run' }
      : await sendSMS(phone, message)

    if (sms.success && !dryRun) {
      await supabase
        .from('jobs')
        .update({
          follow_up_count: nudgeNumber,
          last_contact_at: new Date().toISOString(),
        })
        .eq('id', job.id)

      await supabase.from('message_log').insert({
        customer_id: job.customer_id,
        job_id: job.id,
        phone_number: phone,
        direction: 'outbound',
        message,
        trigger_type: 'estimate_viewed_nudge',
        openphone_message_id: sms.messageId ?? null,
        status: 'sent',
      })
    }

    results.push({
      job_id: job.id,
      client_name: job.client_name,
      phone,
      nudge_number: nudgeNumber,
      sms_ok: sms.success,
      error: sms.success ? undefined : sms.error,
    })
  }

  return results
}

async function findStaleLeads(supabase: ReturnType<typeof getSupabase>): Promise<Array<{
  id: string
  client_name: string
  project_type: string | null
  created_at: string
  age_days: number
}>> {
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('quote_requests')
    .select('id, client_name, project_type, created_at, converted_job_id, site_visit_at, status')
    .lt('created_at', fiveDaysAgo)
    .is('converted_job_id', null)
    .is('site_visit_at', null)
    .not('status', 'eq', 'lost')

  if (!data) return []
  const now = Date.now()
  return data.map((lead) => ({
    id: lead.id,
    client_name: lead.client_name,
    project_type: lead.project_type,
    created_at: lead.created_at,
    age_days: Math.floor((now - new Date(lead.created_at).getTime()) / (24 * 60 * 60 * 1000)),
  }))
}

async function findMorningQueue(supabase: ReturnType<typeof getSupabase>): Promise<Array<{
  id: string
  kind: 'job' | 'lead'
  client_name: string
  next_contact_date: string
}>> {
  const today = new Date().toISOString().slice(0, 10)
  const [jobsRes, leadsRes] = await Promise.all([
    supabase
      .from('jobs')
      .select('id, client_name, next_contact_date')
      .not('next_contact_date', 'is', null)
      .lte('next_contact_date', today),
    supabase
      .from('quote_requests')
      .select('id, client_name, next_follow_up')
      .not('next_follow_up', 'is', null)
      .lte('next_follow_up', today)
      .is('converted_job_id', null),
  ])

  const items: Array<{ id: string; kind: 'job' | 'lead'; client_name: string; next_contact_date: string }> = []
  for (const j of jobsRes.data ?? []) {
    items.push({ id: j.id, kind: 'job', client_name: j.client_name, next_contact_date: j.next_contact_date })
  }
  for (const l of leadsRes.data ?? []) {
    items.push({ id: l.id, kind: 'lead', client_name: l.client_name, next_contact_date: l.next_follow_up })
  }
  return items
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = new URL(req.url).searchParams.get('dry') === '1'
  const supabase = getSupabase()

  const [nudges, staleLeads, morningQueue] = await Promise.all([
    processNudges(supabase, dryRun),
    findStaleLeads(supabase),
    findMorningQueue(supabase),
  ])

  const nudgesSent = nudges.filter((n) => n.sms_ok).length
  const nudgesFailed = nudges.filter((n) => !n.sms_ok).length

  // Post daily summary to Discord (if webhook configured)
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const discordFields: { name: string; value: string; inline?: boolean }[] = [
    {
      name: 'Estimate nudges',
      value: nudges.length === 0
        ? 'No follow-ups needed today'
        : `${nudgesSent} sent${nudgesFailed ? ` · ${nudgesFailed} failed` : ''}`,
      inline: true,
    },
    {
      name: 'Stale leads (5d+)',
      value: staleLeads.length === 0
        ? 'None'
        : `${staleLeads.length}: ${staleLeads.slice(0, 5).map((l) => `${l.client_name} (${l.age_days}d)`).join(', ')}${staleLeads.length > 5 ? '…' : ''}`,
      inline: false,
    },
    {
      name: 'On your queue today',
      value: morningQueue.length === 0
        ? 'Nothing scheduled to reach out'
        : `${morningQueue.length}: ${morningQueue.slice(0, 5).map((q) => q.client_name).join(', ')}${morningQueue.length > 5 ? '…' : ''}`,
      inline: false,
    },
  ]

  const discordResult = await postToDiscord({
    embeds: [
      {
        title: `☕ Daily briefing — ${today}`,
        color:
          nudgesFailed > 0
            ? DISCORD_COLORS.amber
            : staleLeads.length > 0 || morningQueue.length > 0
              ? DISCORD_COLORS.blue
              : DISCORD_COLORS.green,
        fields: discordFields,
        footer: { text: 'Aguirre Modern Tile · Daily Nurture' },
        timestamp: new Date().toISOString(),
      },
    ],
  })

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    ran_at: new Date().toISOString(),
    nudges: { sent: nudgesSent, failed: nudgesFailed, details: nudges },
    stale_leads: staleLeads,
    morning_queue: morningQueue,
    discord: discordResult,
  })
}
