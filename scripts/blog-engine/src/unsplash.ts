import { env } from './config.js'

export interface UnsplashPhoto {
  id: string
  urls: { regular: string; small: string }
  alt_description: string | null
  width: number
  height: number
  user: { name: string; links: { html: string } }
}

export async function searchPhotos(query: string, perPage = 10): Promise<UnsplashPhoto[]> {
  if (!env.UNSPLASH_ACCESS_KEY) {
    console.log('  ⚠ No UNSPLASH_ACCESS_KEY — skipping image search. Upload manually.')
    return []
  }

  const params = new URLSearchParams({
    query,
    per_page: String(perPage),
    orientation: 'landscape',
  })

  const res = await fetch(`https://api.unsplash.com/search/photos?${params.toString()}`, {
    headers: { Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}` },
  })

  if (!res.ok) {
    console.error(`  Unsplash error ${res.status}: ${await res.text()}`)
    return []
  }

  const data = await res.json()
  return data.results || []
}

export async function downloadPhoto(photo: UnsplashPhoto): Promise<{
  buffer: Buffer
  filename: string
  alt: string
} | null> {
  try {
    const res = await fetch(photo.urls.regular)
    if (!res.ok) return null

    const buffer = Buffer.from(await res.arrayBuffer())
    const filename = `${photo.id}.jpg`
    const alt = `${photo.alt_description || 'Airport parking'} — Photo by ${photo.user.name} on Unsplash`

    // Trigger Unsplash download endpoint (required by API guidelines)
    if (env.UNSPLASH_ACCESS_KEY) {
      fetch(`https://api.unsplash.com/photos/${photo.id}/download`, {
        headers: { Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}` },
      }).catch(() => {})
    }

    return { buffer, filename, alt }
  } catch (err) {
    console.error(`  Error downloading photo: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

export async function getUnsplashPhoto(
  query: string,
  usedPhotoIds: string[] = []
): Promise<{
  buffer: Buffer
  filename: string
  alt: string
} | null> {
  const usedSet = new Set(usedPhotoIds)

  // Search with the provided query, then fall back to generic tile imagery
  const queries = [
    query,
    'tile installation interior design',
  ]

  for (const q of queries) {
    const photos = await searchPhotos(q)
    // Skip photos already used by other articles in this cluster
    const available = photos.filter(p => !usedSet.has(p.id))
    if (available.length === 0) continue

    for (const photo of available) {
      const result = await downloadPhoto(photo)
      if (result) return result
    }
  }

  return null
}
