// Schedule helpers for jobs.
//
// When a deposit is paid AND the customer-facing estimate had a target
// start date AND estimated_days is set, we know the install spans X days
// from that start. Auto-fills scheduled_end so the calendar view shows
// the full block from day one — Vince doesn't have to come back and
// re-type it.
//
// Treats estimated_days as CALENDAR days inclusive of the start. So
// Monday + 5 days = Mon-Fri (5 days inclusive). Fractional days round
// up because a 1.5-day job still occupies 2 calendar days on site.
//
// Does NOT skip weekends. If you want crew-Saturday-off behavior,
// extend this helper — every read site uses it.

/**
 * Derive a scheduled_end date from a start + estimated_days, but only
 * when both inputs are present and there's no existing end on file.
 * Returns null when no auto-fill should happen so callers can spread
 * the result into a patch object without conditional branches.
 *
 * @param start         YYYY-MM-DD string from jobs.scheduled_start
 * @param estimatedDays Number from jobs.estimated_days (may be fractional)
 * @param currentEnd    Existing jobs.scheduled_end, if any
 */
export function deriveScheduledEnd(
  start: string | null | undefined,
  estimatedDays: number | null | undefined,
  currentEnd: string | null | undefined,
): string | null {
  if (!start) return null
  if (currentEnd) return null  // never overwrite Vince's manual choice
  if (!estimatedDays || estimatedDays <= 0) return null

  const days = Math.ceil(Number(estimatedDays))
  if (days < 1) return null

  // Parse YYYY-MM-DD as a local date (no UTC drift). Adding T00:00:00
  // anchors it to local midnight; dropping back to YYYY-MM-DD on output
  // sidesteps any later timezone surprises.
  const parts = start.split('-')
  if (parts.length !== 3) return null
  const [y, m, d] = parts.map((p) => Number(p))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null

  const startDate = new Date(y, m - 1, d)
  if (Number.isNaN(startDate.getTime())) return null

  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + days - 1)

  const yyyy = endDate.getFullYear()
  const mm = String(endDate.getMonth() + 1).padStart(2, '0')
  const dd = String(endDate.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
