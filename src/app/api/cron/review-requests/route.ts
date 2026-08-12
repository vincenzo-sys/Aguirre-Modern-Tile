import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, toE164 } from '@/lib/openphone'
import { postToDiscord, DISCORD_COLORS } from '@/lib/discord'
import {
  getReviewUrl,
  selectReviewRequests,
  REVIEW_MESSAGES,
  REVIEW_TRIGGER_ASK1,
  REVIEW_TRIGGER_ASK2,
  DEFAULT_SELECT_OPTIONS,
  type ReviewJob,
  type LoggedMessage,
  type SkipReason,
} from '@/lib/googleReview'

// Google review request cron. Runs daily at 3 PM ET (19:00 UTC) via vercel.json.
//
// Google Maps is the primary lead channel for this business, so every finished
// job that doesn't turn into a review is a lead that never happens. This asks
// for one, by SMS, a couple of days after the job wraps.
//
// WHY A CRON AND NOT A HOOK ON THE STATUS CHANGE:
// The PATCH /api/jobs/[id] handler already fires an SMS when status flips to
// 'completed' — but message_log shows it fired 6 times against 28 finished
// jobs. Jobs get imported, bulk-edited, or created directly in a finished
// state, and every one of those paths skips the hook. A cron that asks "which
// finished jobs have never been asked?" catches all of them, and is idempotent
// by construction.
//
// SAFETY RAILS (see googleReview.ts for the logic, googleReview.test.ts for proof):
//   - GOOGLE_REVIEW_URL must be set to a real write-review deep link, else the
//     run sends nothing. A maps *listing* URL doesn't open the review box.
//   - Only jobs finished between MIN_AGE and MAX_AGE days ago (2..30 default) —
//     without the ceiling, the first run would text customers from last year.
//   - MAX_PER_RUN caps sends even if something upstream goes wrong.
//   - Any inbound message that reads like a complaint disqualifies the job.
//   - Two asks maximum, and any customer reply cancels the second.
//
// Auth: Authorization: Bearer <CRON_SECRET>. Fails closed when unset.

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function isAuthorized(req: NextRequest): boolean {
  // Same fail-closed check as install-reminders/daily-nurture. The x-vercel-cron
  // header is spoofable and must never be enough to trigger outbound customer SMS.
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return req.headers.get('authorization') === `Bearer ${expected}`
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

// Inbound history older than this can't tell us anything useful about a job
// that finished within the last 30 days.
const LOG_LOOKBACK_DAYS = 180

type SendResult = {
  job_id: string
  client_name: string
  ask: 1 | 2
  sms_ok: boolean
  error?: string
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

  const dryRun = req.nextUrl.searchParams.get('dry_run') === 'true'
  const now = new Date()

  const reviewUrl = getReviewUrl()
  if (!reviewUrl) {
    // Fail closed and make the reason loud. Silently sending a listing URL is
    // how the completion email quietly under-converted for months.
    await postToDiscord({
      embeds: [
        {
          title: '⚠️ Review requests skipped — GOOGLE_REVIEW_URL not configured',
          description:
            'Set GOOGLE_REVIEW_URL in Vercel to your Google "write a review" deep link ' +
            '(https://g.page/r/<PLACE_ID>/review). Until then no review asks go out.',
          color: DISCORD_COLORS.amber,
          footer: { text: 'Aguirre Modern Tile · Review Requests' },
          timestamp: now.toISOString(),
        },
      ],
    })
    return NextResponse.json(
      { ok: false, error: 'GOOGLE_REVIEW_URL missing or not a write-review deep link', sent: 0 },
      { status: 200 }
    )
  }

  const supabase = getSupabase()

  const { data: jobRows, error: jobsErr } = await supabase
    .from('jobs')
    .select(
      'id, title, status, client_name, client_phone, customer_id, final_payment_at, scheduled_end, updated_at'
    )
    .in('status', ['completed', 'paid'])
    .limit(500)

  if (jobsErr) {
    return NextResponse.json({ ok: false, error: jobsErr.message }, { status: 500 })
  }

  const since = new Date(now.getTime() - LOG_LOOKBACK_DAYS * 86_400_000).toISOString()
  const { data: logRows } = await supabase
    .from('message_log')
    .select('job_id, phone_number, direction, trigger_type, message, created_at')
    .gte('created_at', since)
    .limit(5000)

  const decisions = selectReviewRequests(
    (jobRows ?? []) as ReviewJob[],
    (logRows ?? []) as LoggedMessage[],
    {
      now,
      minAgeDays: envInt('REVIEW_REQUEST_MIN_AGE_DAYS', DEFAULT_SELECT_OPTIONS.minAgeDays),
      maxAgeDays: envInt('REVIEW_REQUEST_MAX_AGE_DAYS', DEFAULT_SELECT_OPTIONS.maxAgeDays),
      nudgeAfterDays: envInt('REVIEW_REQUEST_NUDGE_AFTER_DAYS', DEFAULT_SELECT_OPTIONS.nudgeAfterDays),
      maxPerRun: envInt('REVIEW_REQUEST_MAX_PER_RUN', DEFAULT_SELECT_OPTIONS.maxPerRun),
    }
  )

  const toSend = decisions.filter((d) => d.send)
  const results: SendResult[] = []

  for (const d of toSend) {
    if (!d.send) continue
    const phone = toE164(d.phone)
    if (!phone) {
      results.push({
        job_id: d.jobId,
        client_name: d.clientName,
        ask: d.ask,
        sms_ok: false,
        error: 'Could not normalize phone to E.164',
      })
      continue
    }

    const message =
      d.ask === 1
        ? REVIEW_MESSAGES.ask1(d.firstName, reviewUrl)
        : REVIEW_MESSAGES.ask2(d.firstName, reviewUrl)

    if (dryRun) {
      results.push({ job_id: d.jobId, client_name: d.clientName, ask: d.ask, sms_ok: true })
      continue
    }

    const sms = await sendSMS(phone, message)

    // Log every attempt, success or failure. A failed row still records that we
    // tried — but it uses status 'failed', and the dedupe only counts rows the
    // selector sees as asks regardless of status, so a hard failure won't be
    // retried forever. That is deliberate: repeated retries against a bad
    // number are noise, and Vince sees the failure in the Discord summary.
    await supabase.from('message_log').insert({
      customer_id: d.customerId,
      job_id: d.jobId,
      phone_number: phone,
      direction: 'outbound',
      message,
      trigger_type: d.ask === 1 ? REVIEW_TRIGGER_ASK1 : REVIEW_TRIGGER_ASK2,
      openphone_message_id: sms.messageId || null,
      status: sms.success ? 'sent' : 'failed',
    })

    if (sms.success) {
      await supabase
        .from('jobs')
        .update({ last_contact_at: now.toISOString() })
        .eq('id', d.jobId)
    }

    results.push({
      job_id: d.jobId,
      client_name: d.clientName,
      ask: d.ask,
      sms_ok: sms.success,
      error: sms.success ? undefined : sms.error,
    })
  }

  // Tally the skips so the summary explains itself rather than just saying "0".
  const skipCounts: Partial<Record<SkipReason, number>> = {}
  for (const d of decisions) {
    if (d.send) continue
    skipCounts[d.reason] = (skipCounts[d.reason] ?? 0) + 1
  }

  const sent = results.filter((r) => r.sms_ok).length
  const failed = results.filter((r) => !r.sms_ok).length

  // Complaint-risk jobs are the ones worth a human. Name them.
  const complaintJobs = decisions
    .filter((d) => !d.send && d.reason === 'complaint-risk')
    .map((d) => d.clientName)

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: 'Review asks sent',
      value: sent === 0 ? 'None today' : `${sent}${failed ? ` · ${failed} failed` : ''}`,
      inline: true,
    },
    {
      name: 'Who',
      value:
        results.length === 0
          ? '—'
          : results.map((r) => `${r.client_name} (ask ${r.ask}${r.sms_ok ? '' : ' — FAILED'})`).join(', '),
      inline: false,
    },
  ]

  if (complaintJobs.length > 0) {
    fields.push({
      name: '🚩 Held back — unresolved issue on file',
      value: `${complaintJobs.join(', ')} — worth a personal call before any review ask.`,
      inline: false,
    })
  }

  const skipSummary = Object.entries(skipCounts)
    .map(([reason, n]) => `${reason}: ${n}`)
    .join(' · ')
  if (skipSummary) {
    fields.push({ name: 'Skipped', value: skipSummary, inline: false })
  }

  await postToDiscord({
    embeds: [
      {
        title: `⭐ Google review requests${dryRun ? ' (dry run)' : ''}`,
        color: failed > 0 ? DISCORD_COLORS.amber : sent > 0 ? DISCORD_COLORS.green : DISCORD_COLORS.gray,
        fields,
        footer: { text: 'Aguirre Modern Tile · Review Requests' },
        timestamp: now.toISOString(),
      },
    ],
  })

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    ran_at: now.toISOString(),
    considered: decisions.length,
    sent,
    failed,
    results,
    skipped: skipCounts,
    held_for_complaint: complaintJobs,
  })
}
