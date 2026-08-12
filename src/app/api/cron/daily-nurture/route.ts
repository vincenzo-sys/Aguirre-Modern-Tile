import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, AUTO_MESSAGES, toE164, smsConfigError } from '@/lib/openphone'
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
  // Authenticate ONLY via Authorization: Bearer <CRON_SECRET>. Vercel injects
  // this header on scheduled invocations when CRON_SECRET is set in the project
  // env. The old `x-vercel-cron` presence check was spoofable — any external
  // caller can set that header and trigger outbound customer SMS — so it's
  // gone. Fail closed when CRON_SECRET is unset (misconfigured → refuse).
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return req.headers.get('authorization') === `Bearer ${expected}`
}

interface NudgeResult {
  job_id: string
  client_name: string
  phone: string
  nudge_number: number
  sms_ok: boolean
  error?: string
}

// Everything the run needs to explain itself. The old signature returned a
// bare NudgeResult[], so "the query blew up", "SMS isn't configured" and
// "nothing to do today" all came back as the same empty array.
interface NudgeRun {
  nudges: NudgeResult[]
  candidates: number
  blocked: number
  queryError?: string
  configError?: string
}

async function processNudges(
  supabase: ReturnType<typeof getSupabase>,
  dryRun: boolean
): Promise<NudgeRun> {
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

  // Surface the query error instead of swallowing it. findStaleLeads below
  // already lost months of stale-lead detection to exactly this pattern (a bad
  // enum value made Postgres reject the whole query and `return []` hid it).
  if (error) {
    return { nudges: [], candidates: 0, blocked: 0, queryError: error.message }
  }
  if (!jobs) return { nudges: [], candidates: 0, blocked: 0 }

  // Don't attempt sends that cannot succeed — say so once, loudly, and leave
  // the jobs untouched so they're still eligible tomorrow.
  const configError = smsConfigError()
  if (configError && !dryRun) {
    return { nudges: [], candidates: jobs.length, blocked: jobs.length, configError }
  }

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

    const sms: { success: boolean; messageId?: string; error?: string } = dryRun
      ? { success: true, messageId: 'dry-run' }
      : await sendSMS(phone, message)

    const problems: string[] = []
    if (!sms.success) problems.push(sms.error || 'send failed')

    if (!dryRun) {
      // Log EVERY attempt, win or lose. The old code inserted only on success,
      // so a failing send wrote no message_log row AND left follow_up_count at
      // 0 — the cron was indistinguishable from one that had never run. That's
      // how this went unnoticed since April with 25 people queued up.
      const { error: insErr } = await supabase.from('message_log').insert({
        customer_id: job.customer_id,
        job_id: job.id,
        phone_number: phone,
        direction: 'outbound',
        message,
        trigger_type: 'estimate_viewed_nudge',
        openphone_message_id: sms.messageId ?? null,
        status: sms.success ? 'sent' : 'failed',
      })
      if (insErr) problems.push(`message_log insert failed: ${insErr.message}`)

      // Only burn a nudge when the text actually went out. A failed send should
      // be retried tomorrow, not counted against the 3-nudge cap.
      if (sms.success) {
        const { error: updErr } = await supabase
          .from('jobs')
          .update({
            follow_up_count: nudgeNumber,
            last_contact_at: new Date().toISOString(),
          })
          .eq('id', job.id)
        if (updErr) problems.push(`jobs update failed: ${updErr.message}`)
      }
    }

    results.push({
      job_id: job.id,
      client_name: job.client_name,
      phone,
      nudge_number: nudgeNumber,
      sms_ok: sms.success && problems.length === 0,
      error: problems.length ? problems.join('; ') : undefined,
    })
  }

  return { nudges: results, candidates: jobs.length, blocked: 0 }
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
    // 'lost' is not a quote_request_status value — comparing against it made
    // Postgres reject the whole query, so stale-lead detection silently
    // returned zero every day. Exclude the real terminal statuses instead.
    .not('status', 'in', '(converted,archived)')

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

  const params = new URL(req.url).searchParams
  const dryRun = params.get('dry') === '1'
  const supabase = getSupabase()

  // ?diag=1 — answer "is this thing wired up?" without sending anything or
  // posting to Discord. Sends nothing even if SMS is configured.
  if (params.get('diag') === '1') {
    const diagRun = await processNudges(supabase, true)
    return NextResponse.json({
      ok: true,
      diag: true,
      sms_config: smsConfigError() ?? 'ok',
      discord_config: process.env.DISCORD_OPS_WEBHOOK ? 'ok' : 'DISCORD_OPS_WEBHOOK not set',
      nudge_candidates: diagRun.candidates,
      nudge_query_error: diagRun.queryError ?? null,
      would_text: diagRun.nudges.map((n) => ({ client_name: n.client_name, nudge: n.nudge_number })),
    })
  }

  const [nudgeRun, staleLeads, morningQueue] = await Promise.all([
    processNudges(supabase, dryRun),
    findStaleLeads(supabase),
    findMorningQueue(supabase),
  ])

  const nudges = nudgeRun.nudges
  const nudgesSent = nudges.filter((n) => n.sms_ok).length
  const nudgesFailed = nudges.filter((n) => !n.sms_ok).length
  // Anything that stopped the run before a send even happened.
  const blockers = [nudgeRun.configError, nudgeRun.queryError].filter(Boolean) as string[]

  // Post daily summary to Discord (if webhook configured)
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const discordFields: { name: string; value: string; inline?: boolean }[] = [
    {
      name: 'Estimate nudges',
      value: blockers.length
        // Never again report "no follow-ups needed" when the truth is "N people
        // were queued and the send path is broken".
        ? `⚠️ ${nudgeRun.blocked} queued, 0 sent — ${blockers.join(' | ')}`
        : nudges.length === 0
          ? 'No follow-ups needed today'
          : `${nudgesSent} sent${nudgesFailed ? ` · ${nudgesFailed} failed` : ''}`,
      inline: true,
    },
    ...(nudgesFailed > 0
      ? [{
          name: 'Why nudges failed',
          value: nudges
            .filter((n) => !n.sms_ok)
            .slice(0, 5)
            .map((n) => `${n.client_name}: ${n.error ?? 'unknown'}`)
            .join('\n')
            .slice(0, 1000),
          inline: false,
        }]
      : []),
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
          nudgesFailed > 0 || blockers.length
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
    ok: blockers.length === 0,
    dry_run: dryRun,
    ran_at: new Date().toISOString(),
    blockers,
    nudges: {
      candidates: nudgeRun.candidates,
      sent: nudgesSent,
      failed: nudgesFailed,
      blocked: nudgeRun.blocked,
      details: nudges,
    },
    stale_leads: staleLeads,
    morning_queue: morningQueue,
    discord: discordResult,
  })
}
