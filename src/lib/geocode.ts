// Lightweight geocoding helper for transportation pricing.
//
// Uses OpenStreetMap's Nominatim API (free, no API key) with a polite User-
// Agent and a hard timeout so a slow geocoder can't tank an estimate
// generation. Falls back to null on any error — callers handle the missing
// distance themselves (typically by using a transportation floor).
//
// Distance calc: haversine for straight-line miles, then multiplied by a
// road factor (1.3) to approximate driving distance in metro Boston where
// roads bend around Logan, the Tobin, and the rest of the harbor. For
// long-distance jobs this estimate may be off by a few miles; the user
// can override the line item amount post-generation.

const REVERE_MA = { lat: 42.4084, lng: -71.0120 }
const ROAD_FACTOR = 1.3
const NOMINATIM_TIMEOUT_MS = 5000

interface GeocodeResult {
  lat: number
  lng: number
}

async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (!address || address.trim().length < 5) return null
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', address)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('countrycodes', 'us')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS)
  try {
    const res = await fetch(url.toString(), {
      headers: {
        // Nominatim TOS requires a real UA identifying the application.
        'User-Agent': 'AguirreModernTile-Estimator/1.0 (vincenzo@pembertonholdingsllc.com)',
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const arr = (await res.json()) as Array<{ lat: string; lon: string }>
    if (!Array.isArray(arr) || arr.length === 0) return null
    const lat = Number(arr[0].lat)
    const lng = Number(arr[0].lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function haversineMiles(a: GeocodeResult, b: GeocodeResult): number {
  const R = 3959 // earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(sa))
}

// Returns one-way driving miles from Revere MA to the given address, or
// null if geocoding fails or the address is too vague. Round-trip = 2x.
export async function milesFromRevere(address: string | null | undefined): Promise<number | null> {
  if (!address) return null
  const dest = await geocodeAddress(address)
  if (!dest) return null
  const straightLine = haversineMiles(REVERE_MA, dest)
  return Math.round(straightLine * ROAD_FACTOR * 10) / 10
}
