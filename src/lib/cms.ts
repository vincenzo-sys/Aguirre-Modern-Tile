const CMS_URL = process.env.NEXT_PUBLIC_CMS_URL || 'http://localhost:3001'

interface FetchOptions {
  revalidate?: number
}

export async function fetchFromCms<T = any>(
  path: string,
  params: Record<string, string> = {},
  options: FetchOptions = {}
): Promise<T | null> {
  const { revalidate = 60 } = options
  try {
    const url = new URL('/api' + path, CMS_URL)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
    const res = await fetch(url.toString(), {
      next: { revalidate },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function getCmsGlobal<T = any>(slug: string): Promise<T | null> {
  return fetchFromCms<T>(`/globals/${slug}`)
}

export async function getCmsCollection<T = any>(
  slug: string,
  params: Record<string, string> = {}
): Promise<{ docs: T[]; totalDocs: number } | null> {
  return fetchFromCms(`/${slug}`, params)
}

export function resolveCmsImageUrl(url: string | undefined | null): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  if (url.startsWith('/')) return url
  return `${CMS_URL}${url.startsWith('/') ? '' : '/'}${url}`
}
