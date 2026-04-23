import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// iCal text needs CRLF line endings, escapes for `,` `;` `\` `\n`, and a 75-octet
// fold limit. Calendar clients are forgiving but spec-compliance avoids surprises.
function escapeIcsText(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function toIcsDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

function toIcsDate(yyyyMmDd: string): string {
  return yyyyMmDd.replace(/-/g, '')
}

// GET /api/schedule.ics?key=<TILE_API_KEY>
//
// Token-in-URL auth (calendar clients can't carry session cookies). For v1 we
// reuse TILE_API_KEY since this is a single-owner calendar. To revoke access,
// rotate TILE_API_KEY (which also rotates the MCP/agent key — acceptable for
// this single-user setup; per-user ICS tokens are a v2 follow-up if shared).
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const provided = url.searchParams.get('key')
  const expected = process.env.TILE_API_KEY
  if (!expected || !provided || provided !== expected) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // Pull a wide window: 90 days back, 12 months forward. Calendar clients
  // poll periodically and want past + future visible.
  const today = new Date()
  const from = new Date(today.getTime() - 90 * 86_400_000).toISOString().slice(0, 10)
  const to = new Date(today.getTime() + 365 * 86_400_000).toISOString().slice(0, 10)

  const supabase = getSupabase()

  const [visitsRes, jobsRes] = await Promise.all([
    supabase
      .from('quote_requests')
      .select('id, client_name, client_phone, site_visit_at, site_visit_notes, answers')
      .gte('site_visit_at', `${from}T00:00:00Z`)
      .lte('site_visit_at', `${to}T23:59:59Z`)
      .not('site_visit_at', 'is', null),
    supabase
      .from('jobs')
      .select('id, job_number, title, status, scheduled_start, scheduled_end, client_name, client_address, client_phone')
      .not('scheduled_start', 'is', null)
      .gte('scheduled_start', from)
      .lte('scheduled_start', to),
  ])

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Aguirre Modern Tile//Schedule//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Aguirre Modern Tile — Schedule',
    'X-WR-TIMEZONE:America/New_York',
  ]

  const dtstamp = toIcsDateTime(new Date().toISOString())

  for (const v of visitsRes.data ?? []) {
    const answers = (v.answers ?? {}) as { address?: string }
    const start = toIcsDateTime(v.site_visit_at as string)
    // 1-hour default duration for estimate visits
    const endIso = new Date(new Date(v.site_visit_at as string).getTime() + 60 * 60_000).toISOString()
    const end = toIcsDateTime(endIso)
    const summary = escapeIcsText(`Estimate visit — ${v.client_name}`)
    const description = escapeIcsText(
      [
        v.client_phone ? `Phone: ${v.client_phone}` : null,
        v.site_visit_notes ? `Notes: ${v.site_visit_notes}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    )
    const location = escapeIcsText(answers.address ?? '')

    lines.push(
      'BEGIN:VEVENT',
      `UID:visit-${v.id}@aguirremoderntile.com`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${summary}`,
      ...(description ? [`DESCRIPTION:${description}`] : []),
      ...(location ? [`LOCATION:${location}`] : []),
      'CATEGORIES:Estimate Visit',
      'END:VEVENT',
    )
  }

  for (const j of jobsRes.data ?? []) {
    // All-day events use VALUE=DATE and DTEND is exclusive (end-day + 1)
    const startDate = toIcsDate(j.scheduled_start as string)
    const endDateRaw = (j.scheduled_end as string) || (j.scheduled_start as string)
    const endDateExclusive = new Date(new Date(endDateRaw + 'T00:00:00Z').getTime() + 86_400_000)
      .toISOString()
      .slice(0, 10)
    const summary = escapeIcsText(`Install #${j.job_number} — ${j.title || j.client_name}`)
    const description = escapeIcsText(
      [
        `Status: ${j.status}`,
        j.client_phone ? `Phone: ${j.client_phone}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    )
    const location = escapeIcsText(j.client_address ?? '')

    lines.push(
      'BEGIN:VEVENT',
      `UID:job-${j.id}@aguirremoderntile.com`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${startDate}`,
      `DTEND;VALUE=DATE:${toIcsDate(endDateExclusive)}`,
      `SUMMARY:${summary}`,
      ...(description ? [`DESCRIPTION:${description}`] : []),
      ...(location ? [`LOCATION:${location}`] : []),
      'CATEGORIES:Install',
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')

  return new NextResponse(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="aguirre-schedule.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  })
}
