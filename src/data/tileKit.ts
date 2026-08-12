// Tile Match Kit — the paid sample/selection offer that feeds install quotes.
//
// Everything Vince is likely to want to change (price, credit, what's in the
// box, which towns qualify) lives here so the funnel can be re-priced without
// touching the page, the form, or the API route.

export const TILE_KIT = {
  /** What the customer pays at checkout, in dollars. */
  price: 25,
  /** Credit applied to their install if they book. Deliberately 2x the price. */
  installCredit: 50,
  /** Minimum job size the credit applies to — keeps it off $300 patch repairs. */
  creditMinimumJob: 750,
  /** How many physical samples they choose. */
  sampleCount: 5,
  /** Business days to hand-deliver / have ready for pickup. */
  turnaroundDays: 3,
} as const

/**
 * Towns Aguirre already services (these mirror the /tilecontractor* landing
 * pages). The kit is hand-delivered, not shipped, so the funnel gates on
 * service area up front rather than collecting an order it can't fulfil.
 */
export const KIT_SERVICE_TOWNS = [
  'Arlington',
  'Belmont',
  'Boston',
  'Brookline',
  'Cambridge',
  'Chelsea',
  'Everett',
  'Lynn',
  'Malden',
  'Medford',
  'Melrose',
  'Nahant',
  'Revere',
  'Saugus',
  'Somerville',
  'Stoneham',
  'Swampscott',
  'Wakefield',
  'Watertown',
  'Winthrop',
] as const

/** Rooms map onto the existing /quote/<type> intake so scope carries over. */
export const KIT_ROOMS = [
  { value: 'bathroom', label: 'Bathroom floor + walls' },
  { value: 'shower', label: 'Shower / tub surround' },
  { value: 'backsplash', label: 'Kitchen backsplash' },
  { value: 'kitchen-floor', label: 'Kitchen or living floor' },
  { value: 'other', label: 'Something else' },
] as const

/**
 * Style buckets, not SKUs. Vince picks the actual samples from distributor
 * racks — this only has to be accurate enough to pull the right five chips.
 */
export const KIT_STYLES = [
  {
    value: 'modern-minimal',
    label: 'Modern minimal',
    blurb: 'Large-format porcelain, tight grout lines, matte white and greige',
  },
  {
    value: 'classic-subway',
    label: 'Classic subway',
    blurb: 'Handmade-look ceramic, beveled edges, timeless kitchens and baths',
  },
  {
    value: 'warm-natural',
    label: 'Warm natural',
    blurb: 'Wood-look plank, travertine and limestone tones, organic texture',
  },
  {
    value: 'bold-pattern',
    label: 'Bold pattern',
    blurb: 'Zellige, encaustic, geometric mosaics — the feature-wall look',
  },
  {
    value: 'stone-marble',
    label: 'Stone + marble',
    blurb: 'Carrara, calacatta and marble-look porcelain at a real-world price',
  },
  {
    value: 'not-sure',
    label: 'Not sure yet',
    blurb: "Send a mix — that's what the kit is for",
  },
] as const

/** Rough budget signal. Drives which price band of samples gets pulled. */
export const KIT_BUDGETS = [
  { value: 'value', label: 'Value — best price per sq ft' },
  { value: 'mid', label: 'Mid-range — the usual sweet spot' },
  { value: 'premium', label: 'Premium — statement material' },
  { value: 'unsure', label: 'Show me the range' },
] as const

/** Timeline doubles as lead scoring — "this month" jumps the follow-up queue. */
export const KIT_TIMELINES = [
  { value: 'asap', label: 'This month' },
  { value: '1-3-months', label: '1-3 months' },
  { value: '3-plus-months', label: '3+ months' },
  { value: 'planning', label: 'Just planning' },
] as const

export type KitRoom = (typeof KIT_ROOMS)[number]['value']

/** Normalises free-text town entry so "somerville " matches "Somerville". */
export function isServiceTown(town: string): boolean {
  const normalized = town.trim().toLowerCase()
  return KIT_SERVICE_TOWNS.some((t) => t.toLowerCase() === normalized)
}
