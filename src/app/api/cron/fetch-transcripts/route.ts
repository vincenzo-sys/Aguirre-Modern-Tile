import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchOpenPhoneTranscript } from '@/lib/openphoneTranscripts'

// Catch-up cron — runs daily at 13:30 UTC (8:30 AM ET) via vercel.json.
// Finds completed calls from the last 48 hours that don't have a
// transcript yet and tries to pull one from OpenPhone. Belt-and-suspenders
// for the webhook-driven path: if a webhook drops or OpenPhone's
// transcript wasn't ready when call.completed fired, the next cron run
// picks it up. Vercel's Hobby plan limits crons to daily, so this is the
// max frequency we can run — upgrade to Pro if we ever need more.

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
  // that header — so it's gone. Fail closed when CRON_SECRET is unset.
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return req.headers.get('authorization') === `Bearer ${expected}`
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = new URL(req.url).searchParams.get('dry') === '1'
  const supabase = getSupabase()

  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  const { data: calls, error } = await supabase
    .from('call_log')
    .select('id, openphone_call_id, phone_number, direction, duration, created_at')
    .is('transcript', null)
    .not('openphone_call_id', 'is', null)
    .gt('duration', 0)
    .gte('created_at', fortyEightHoursAgo)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: Array<{
    call_log_id: string
    openphone_call_id: string
    chars: number | null
    status: 'saved' | 'missing' | 'error' | 'dry'
    error?: string
  }> = []

  for (const row of calls ?? []) {
    const callId = row.openphone_call_id as string
    try {
      if (dryRun) {
        results.push({ call_log_id: row.id, openphone_call_id: callId, chars: null, status: 'dry' })
        continue
      }
      const transcript = await fetchOpenPhoneTranscript(callId)
      if (!transcript || !transcript.text) {
        results.push({ call_log_id: row.id, openphone_call_id: callId, chars: 0, status: 'missing' })
        continue
      }
      const { error: updateErr } = await supabase
        .from('call_log')
        .update({ transcript: transcript.text })
        .eq('id', row.id)
      if (updateErr) {
        results.push({
          call_log_id: row.id,
          openphone_call_id: callId,
          chars: null,
          status: 'error',
          error: updateErr.message,
        })
        continue
      }
      results.push({
        call_log_id: row.id,
        openphone_call_id: callId,
        chars: transcript.text.length,
        status: 'saved',
      })
    } catch (err) {
      results.push({
        call_log_id: row.id,
        openphone_call_id: callId,
        chars: null,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown',
      })
    }
  }

  const savedCount = results.filter((r) => r.status === 'saved').length
  const missingCount = results.filter((r) => r.status === 'missing').length
  const errorCount = results.filter((r) => r.status === 'error').length

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    ran_at: new Date().toISOString(),
    scanned: calls?.length ?? 0,
    saved: savedCount,
    still_missing: missingCount,
    errors: errorCount,
    results,
  })
}
