// Project photo library — the rules that decide what a job photo is tagged
// with and whether it may ever be shown to the public.
//
// Companion to migration 058. The SQL view `publishable_job_photos` is the
// read model the database enforces; `isPublishable` below is the same four
// conditions expressed in TypeScript so client code can grey out a control
// without a round trip, and so the rule is unit-testable. If you change one,
// change the other — they are checked against each other in the tests.

export const PUBLISH_STATUSES = ['unreviewed', 'approved', 'blocked'] as const
export type PublishStatus = (typeof PUBLISH_STATUSES)[number]

export const PHOTO_CONSENTS = ['unasked', 'granted', 'denied'] as const
export type PhotoConsent = (typeof PHOTO_CONSENTS)[number]

export const PHOTO_TYPES = ['before', 'after', 'reference'] as const
export type PhotoType = (typeof PHOTO_TYPES)[number]

// Statuses that mean the work is finished. Mirrors the gallery page and the
// view's `j.status IN ('completed','paid')`.
export const FINISHED_JOB_STATUSES = ['completed', 'paid'] as const

// Room tags offered at capture time. Kept short on purpose: a free-text field
// on a phone at the end of a workday produces "bathrm", "Bath ", "master bath"
// and three of those never match a filter again. Ordered by how often the job
// types actually occur in the CRM.
export const ROOM_TYPES = [
  'Bathroom',
  'Shower',
  'Kitchen Floor',
  'Backsplash',
  'Floor',
  'Fireplace',
  'Steam Room',
  'Entryway',
  'Laundry',
  'Other',
] as const
export type RoomType = (typeof ROOM_TYPES)[number]

/**
 * Best-guess room tag for a job, used to prefill the completion sheet.
 *
 * jobs.job_type is free text in practice ("Bathroom", "Bathroom Floor",
 * "Shower + floor"), so match loosely and fall back to the raw value rather
 * than to 'Other' — a crew member correcting a nearly-right prefill is a tap;
 * one that says 'Other' on every job gets ignored and every photo lands
 * untagged.
 */
export function roomTypeFromJobType(jobType: string | null | undefined): string | null {
  if (!jobType) return null
  const raw = jobType.trim()
  if (!raw) return null
  const lower = raw.toLowerCase()

  // Most specific first: "shower" beats "bathroom" in "Bathroom shower reno",
  // because the photograph people stop scrolling for is the shower.
  const rules: Array<[RegExp, RoomType]> = [
    [/steam/, 'Steam Room'],
    [/shower|tub surround/, 'Shower'],
    [/backsplash/, 'Backsplash'],
    [/fireplace|hearth|surround/, 'Fireplace'],
    [/kitchen/, 'Kitchen Floor'],
    [/entry|foyer|mudroom/, 'Entryway'],
    [/laundry/, 'Laundry'],
    [/bath|powder|lavatory/, 'Bathroom'],
    [/floor|tile floor/, 'Floor'],
  ]
  for (const [pattern, room] of rules) {
    if (pattern.test(lower)) return room
  }
  return raw
}

// Street-address noise we must never let through as a "town".
const UNIT_PREFIX = /^(unit|apt|apartment|suite|ste|#|floor|fl|rear|bldg|building)\b/i
const STATE_TAIL =
  /([^,]+),\s*(?:MA|Mass|Massachusetts|NH|New\s+Hampshire|RI|Rhode\s+Island)\.?\s*(?:\d{5}(?:-\d{4})?)?\s*$/i

/**
 * Town from a free-text client_address, for local-SEO captions.
 *
 * Returns null rather than guessing. A caption that says the wrong town is
 * worse than one with no town at all: it advertises finished work in a market
 * Aguirre does not serve, and the lead it draws is a wasted drive.
 *
 * Never returns the street line — the published caption for a customer's home
 * must not carry their house number.
 */
export function townFromAddress(address: string | null | undefined): string | null {
  if (!address) return null
  const cleaned = address.replace(/\s+/g, ' ').trim()
  if (!cleaned) return null

  const match = cleaned.match(STATE_TAIL)
  if (!match) return null

  const candidate = match[1].trim().replace(/^[.,\-\s]+|[.,\-\s]+$/g, '')
  if (!candidate) return null

  // "12 Elm St, Unit C, MA" — the segment before the state is a unit, not a
  // town. Refuse rather than publish "Unit C".
  if (UNIT_PREFIX.test(candidate)) return null

  // A leading house number means we grabbed the street line, i.e. the address
  // had no town segment at all ("70 Brissette Ave, MA").
  if (/^\d/.test(candidate)) return null

  // Towns are one to three words. Anything longer is a run-on address segment.
  if (candidate.split(' ').length > 3) return null

  return candidate
}

export interface PublishabilityInput {
  jobStatus: string | null | undefined
  photoConsent: string | null | undefined
  publishStatus: string | null | undefined
  photoType: string | null | undefined
}

/**
 * The one definition of "safe to publish", matching the SQL view.
 *
 * All four conditions are required and all four default to the closed
 * position, so a row that predates migration 058 — or one whose consent was
 * never asked — is never publishable by omission.
 */
export function isPublishable(input: PublishabilityInput): boolean {
  const { jobStatus, photoConsent, publishStatus, photoType } = input
  if (!jobStatus || !FINISHED_JOB_STATUSES.includes(jobStatus as 'completed')) return false
  if (photoConsent !== 'granted') return false
  if (publishStatus !== 'approved') return false
  if (photoType !== 'before' && photoType !== 'after') return false
  return true
}

/**
 * Why a photo is not publishable, in the order a human would fix it.
 * Drives the "what's blocking this" line in the dashboard gallery.
 */
export function publishBlockers(input: PublishabilityInput): string[] {
  const blockers: string[] = []
  if (!input.jobStatus || !FINISHED_JOB_STATUSES.includes(input.jobStatus as 'completed')) {
    blockers.push('Job is not marked completed or paid')
  }
  if (input.photoConsent === 'denied') blockers.push('Customer declined photo use')
  else if (input.photoConsent !== 'granted') blockers.push('Photo consent never asked')
  if (input.publishStatus === 'blocked') blockers.push('Frame was blocked in review')
  else if (input.publishStatus !== 'approved') blockers.push('Frame not reviewed yet')
  if (input.photoType !== 'before' && input.photoType !== 'after') {
    blockers.push('Reference photo, not before/after')
  }
  return blockers
}

/**
 * Caption for a pin, a Google Business post or a blog card.
 *
 * Room + town, never the customer's name and never the street. "Marblehead
 * master bath" is the searchable unit; "IMG_4471" is not.
 */
export function photoCaption(photo: {
  room_type?: string | null
  town?: string | null
  photo_type?: string | null
  caption?: string | null
}): string {
  if (photo.caption?.trim()) return photo.caption.trim()

  const room = photo.room_type?.trim()
  const town = photo.town?.trim()
  const stage = photo.photo_type === 'before' ? 'before' : null

  const subject = [town, room].filter(Boolean).join(' ')
  if (!subject) return stage ? 'Tile installation — before' : 'Tile installation'
  return stage ? `${subject} — before` : subject
}

export interface CompletionPhotoState {
  photo_type?: string | null
}

export interface CompletionReadiness {
  beforeCount: number
  afterCount: number
  /** A publishable set needs at least one finished-work frame. */
  hasAfter: boolean
  /** Both halves present — the pair that actually performs on Pinterest. */
  hasPair: boolean
  /** Plain-language nudge shown on the completion sheet. */
  message: string
}

/**
 * What the completion sheet tells the crew about this job's photo set.
 *
 * Note the asymmetry: a missing "after" is the blocking problem (it is the
 * only shot that can never be retaken once the crew drives away), while a
 * missing "before" is merely a weaker post. Existing before photos usually
 * came from the customer's own quote-form submission months earlier.
 */
export function completionReadiness(photos: CompletionPhotoState[]): CompletionReadiness {
  const beforeCount = photos.filter(
    (p) => p.photo_type === 'before' || p.photo_type === 'reference'
  ).length
  const afterCount = photos.filter((p) => p.photo_type === 'after').length
  const hasAfter = afterCount > 0
  const hasPair = hasAfter && beforeCount > 0

  let message: string
  if (!hasAfter) {
    message = 'No finished-work photos yet. This is the last chance to shoot them.'
  } else if (!hasPair) {
    message = `${afterCount} after photo${afterCount === 1 ? '' : 's'} — no before shot to pair with.`
  } else {
    message = `${beforeCount} before / ${afterCount} after — ready to pair.`
  }

  return { beforeCount, afterCount, hasAfter, hasPair, message }
}
