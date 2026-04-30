// Tiny .ics (iCalendar) generator — used to attach calendar invites to
// customer emails so a tap on iOS/Gmail/Outlook drops the install dates
// straight into the customer's calendar app.
//
// We deliberately don't pull in a heavyweight library (ical-generator etc.)
// because the format we emit is small and stable: VEVENT with start/end
// dates, summary, description, location, and a stable UID. The trickiest
// requirement is CRLF line endings — RFC 5545 demands them, and many
// parsers reject \n-only output.

interface IcsEvent {
  // Stable per-event identifier so calendar apps can update vs. duplicate
  // when we resend (e.g., schedule changes). Use the job_id.
  uid: string
  // YYYY-MM-DD (date-only — installs are full days, not timed)
  startDate: string
  // YYYY-MM-DD inclusive end. Will be converted to exclusive DTEND
  // because the iCal spec treats DATE-typed DTEND as exclusive.
  endDate: string
  summary: string
  description?: string
  location?: string
}

function fmtDate(d: string): string {
  // YYYY-MM-DD -> YYYYMMDD
  return d.replace(/-/g, '')
}

function plusOneDay(yyyymmdd: string): string {
  const d = new Date(yyyymmdd + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function escape(text: string): string {
  // RFC 5545 §3.3.11: backslash, comma, semicolon, and newlines must be
  // escaped inside text values.
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

export function buildIcs(event: IcsEvent): string {
  const dtstamp =
    new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const dtend = plusOneDay(event.endDate)

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Aguirre Modern Tile//Install//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}@aguirremoderntile.com`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${fmtDate(event.startDate)}`,
    `DTEND;VALUE=DATE:${fmtDate(dtend)}`,
    `SUMMARY:${escape(event.summary)}`,
  ]
  if (event.description) lines.push(`DESCRIPTION:${escape(event.description)}`)
  if (event.location) lines.push(`LOCATION:${escape(event.location)}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')

  return lines.join('\r\n') + '\r\n'
}
