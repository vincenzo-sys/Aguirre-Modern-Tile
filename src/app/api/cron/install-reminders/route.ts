import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, AUTO_MESSAGES, toE164, smsConfigError } from '@/lib/openphone'
import { postToDiscord, DISCORD_COLORS } from '@/lib/discord'

// Install reminder cron. Runs daily at 8 AM ET (13:00 UTC) via vercel.json.
//
// Two automated SMS reminders to the customer in the lead-up to install:
//
//   1. **Day-before** — for jobs whose scheduled_start = tomorrow.
//      "Crew arrives tomorrow 8-9am at [address]." Lets them clear the
//      area, arrange pets, decide whether they'll be home.
//
//   2. **Morning-of** — for jobs whose scheduled_start = today.
//      "Crew is on the way." Closes the day-of "are they coming?"
//      anxiety that turns even satisfied customers into worriers.
//
// Dedupe via message_log: each job + reminder type can only fire once.
// If the cron runs twice on the same day (Vercel retry, manual trigger),
// the second pass is a no-op.
//
// Auth: x-vercel-cron header OR CRON_SECRET match.

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function isAuthorized(req: NextRequest): boolean {
  // Authenticate ONLY via Authorization: Bearer <CRON_SECRET>. Vercel injects
  // this header on scheduled invocations when CRON_SECRET is set. The old
  // `x-vercel-cron` presence check was spoofable — any external caller can set
  // that header and trigger outbound customer SMS — so it's gone. Fail closed
  // when CRON_SECRET is unset (misconfigured → refuse).
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return req.headers.get('authorization') === `Bearer ${expected}`
}

// YYYY-MM-DD in America/New_York. Jobs schedule on calendar days, not
// instants — so we compare against the local day, not UTC.
function todayInET(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(new Date())
}

function tomorrowInET(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(new Date(Date.now() + 24 * 60 * 60 * 1000))
}

type Job = {
  id: string
  client_name: string | null
  client_phone: string | null
  client_address: string | null
  customer_id: string | null
  scheduled_start: string | null
  status: string | null
}

async function alreadySent(
  supabase: ReturnType<typeof getSupabase>,
  jobId: string,
  triggerType: string
): Promise<boolean> {
  const { data } = await supabase
    .from('message_log')
    .select('id')
    .eq('job_id', jobId)
    .eq('trigger_type', triggerType)
    .eq('status', 'sent')
    .limit(1)
  return (data?.length ?? 0) > 0
}

async function fireReminder(
  supabase: ReturnType<typeof getSupabase>,
  job: Job,
  triggerType: 'install_day_before_reminder' | 'install_morning_of_reminder',
  body: string,
  dryRun: boolean
): Promise<{ jobId: string; ok: boolean; error?: string }> {
  const phone = job.client_phone ? toE164(job.client_phone) : null
  if (!phone) {
    // Skipped, not sent — and message_log.phone_number is NOT NULL so there's
    // nothing sane to log. The caller surfaces this in Discord instead.
    return { jobId: job.id, ok: false, error: `no valid phone (raw: ${job.client_phone ?? 'null'})` }
  }

  if (dryRun) {
    return { jobId: job.id, ok: true }
  }

  const result = await sendSMS(phone, body)
  const { error: insErr } = await supabase.from('message_log').insert({
    customer_id: job.customer_id,
    job_id: job.id,
    phone_number: phone,
    direction: 'outbound',
    message: body,
    trigger_type: triggerType,
    openphone_message_id: result.messageId || null,
    status: result.success ? 'sent' : 'failed',
  })

  // Also stamp last_contact_at so other crons don't pile on top of this one.
  if (result.success) {
    await supabase
      .from('jobs')
      .update({ last_contact_at: new Date().toISOString() })
      .eq('id', job.id)
  }

  const problems: string[] = []
  if (!result.success) problems.push(result.error || 'send failed')
  if (insErr) problems.push(`message_log insert failed: ${insErr.message}`)

  return {
    jobId: job.id,
    ok: result.success && !insErr,
    error: problems.length ? problems.join('; ') : undefined,
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = req.nextUrl.searchParams
  const dryRun = params.get('dry_run') === 'true'
  const diag = params.get('diag') === '1'
  const supabase = getSupabase()

  const today = todayInET()
  const tomorrow = tomorrowInET()

  const { data: dayBeforeJobs, error: dayBeforeErr } = await supabase
    .from('jobs')
    .select('id, client_name, client_phone, client_address, customer_id, scheduled_start, status')
    .in('status', ['scheduled', 'accepted_not_scheduled'])
    .eq('scheduled_start', tomorrow)

  const { data: morningOfJobs, error: morningOfErr } = await supabase
    .from('jobs')
    .select('id, client_name, client_phone, client_address, customer_id, scheduled_start, status')
    .in('status', ['scheduled', 'in_progress'])
    .eq('scheduled_start', today)

  // A rejected query used to look exactly like "no installs tomorrow".
  const blockers: string[] = []
  if (dayBeforeErr) blockers.push(`day-before query failed: ${dayBeforeErr.message}`)
  if (morningOfErr) blockers.push(`morning-of query failed: ${morningOfErr.message}`)

  const configError = smsConfigError()

  // ?diag=1 — is this wired up? Sends nothing, posts nothing.
  if (diag) {
    return NextResponse.json({
      ok: true,
      diag: true,
      today,
      tomorrow,
      sms_config: configError ?? 'ok',
      discord_config: process.env.DISCORD_OPS_WEBHOOK ? 'ok' : 'DISCORD_OPS_WEBHOOK not set',
      blockers,
      day_before_candidates: (dayBeforeJobs ?? []).map((j) => j.client_name),
      morning_of_candidates: (morningOfJobs ?? []).map((j) => j.client_name),
    })
  }

  if (configError && !dryRun) blockers.push(configError)

  const dayBeforeResults: Array<{ jobId: string; ok: boolean; error?: string }> = []
  const morningOfResults: Array<{ jobId: string; ok: boolean; error?: string }> = []

  // Config is broken — don't fire blind. Report and leave both buckets
  // untouched so they're still eligible once the env var lands.
  const skipSends = Boolean(configError) && !dryRun

  for (const job of (skipSends ? [] : (dayBeforeJobs ?? [])) as Job[]) {
    const dup = await alreadySent(supabase, job.id, 'install_day_before_reminder')
    if (dup) continue
    const firstName = (job.client_name || '').split(' ')[0] || ''
    const body = AUTO_MESSAGES.install_day_before(firstName, job.client_address || '')
    const r = await fireReminder(supabase, job, 'install_day_before_reminder', body, dryRun)
    dayBeforeResults.push(r)
  }

  for (const job of (skipSends ? [] : (morningOfJobs ?? [])) as Job[]) {
    const dup = await alreadySent(supabase, job.id, 'install_morning_of_reminder')
    if (dup) continue
    const firstName = (job.client_name || '').split(' ')[0] || ''
    const body = AUTO_MESSAGES.install_morning_of(firstName)
    const r = await fireReminder(supabase, job, 'install_morning_of_reminder', body, dryRun)
    morningOfResults.push(r)
  }

  const all = [...dayBeforeResults, ...morningOfResults]
  const sent = all.filter((r) => r.ok).length
  const failed = all.filter((r) => !r.ok).length
  const queued = (dayBeforeJobs?.length ?? 0) + (morningOfJobs?.length ?? 0)

  // This cron previously reported to nobody — it could run clean for months
  // while sending nothing and no one would know. Stay quiet on a genuine
  // no-op day; speak up whenever there was work to do or something broke.
  let discord: { ok: boolean; error?: string } | null = null
  if (!dryRun && (queued > 0 || blockers.length > 0)) {
    discord = await postToDiscord({
      embeds: [
        {
          title: '🔧 Install reminders',
          color: blockers.length || failed ? DISCORD_COLORS.amber : DISCORD_COLORS.green,
          fields: [
            {
              name: 'Today / tomorrow',
              value: `${today} / ${tomorrow}`,
              inline: true,
            },
            {
              name: 'Reminders',
              value: blockers.length
                ? `⚠️ ${queued} install(s) queued, 0 texted`
                : `${sent} sent${failed ? ` · ${failed} failed` : ''}`,
              inline: true,
            },
            ...(blockers.length
              ? [{ name: 'Blocked by', value: blockers.join('\n').slice(0, 1000), inline: false }]
              : []),
            ...(failed
              ? [{
                  name: 'Failures',
                  value: all.filter((r) => !r.ok).map((r) => `${r.jobId}: ${r.error}`).join('\n').slice(0, 1000),
                  inline: false,
                }]
              : []),
          ],
          footer: { text: 'Aguirre Modern Tile · Install Reminders' },
          timestamp: new Date().toISOString(),
        },
      ],
    })
  }

  return NextResponse.json({
    ok: blockers.length === 0,
    dryRun,
    today,
    tomorrow,
    blockers,
    queued,
    day_before: { fired: dayBeforeResults.length, results: dayBeforeResults },
    morning_of: { fired: morningOfResults.length, results: morningOfResults },
    discord,
  })
}
