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

// --- Blog helpers ---

function resolvePostImages(post: any): any {
  if (post?.featuredImage?.url) {
    post.featuredImage.url = resolveCmsImageUrl(post.featuredImage.url)
  }
  // Resolve images inside Lexical rich text content
  if (post?.content?.root?.children) {
    const walk = (nodes: any[]) => {
      for (const node of nodes) {
        if (node.type === 'upload' && node.value?.url) {
          node.value.url = resolveCmsImageUrl(node.value.url)
        }
        if (node.children) walk(node.children)
      }
    }
    walk(post.content.root.children)
  }
  return post
}

export async function getPublishedPosts(
  extraFilters: Record<string, string> = {},
  page = 1,
  limit = 12
) {
  const params: Record<string, string> = {
    'where[status][equals]': 'published',
    sort: '-publishedAt',
    depth: '2',
    page: String(page),
    limit: String(limit),
    ...extraFilters,
  }

  const data = await fetchFromCms<any>('/blog-posts', params)
  if (!data) return { docs: [], totalPages: 0, totalDocs: 0, page: 1 }

  return {
    docs: (data.docs || []).map(resolvePostImages),
    totalPages: data.totalPages || 1,
    totalDocs: data.totalDocs || 0,
    page: data.page || 1,
  }
}

export async function getPostBySlug(slug: string) {
  const data = await fetchFromCms<any>('/blog-posts', {
    'where[slug][equals]': slug,
    'where[status][equals]': 'published',
    depth: '2',
  })

  const post = data?.docs?.[0] || null
  return post ? resolvePostImages(post) : null
}

export async function getRelatedPosts(
  serviceType: string,
  excludeSlug: string,
  limit = 3
) {
  const data = await fetchFromCms<any>('/blog-posts', {
    'where[status][equals]': 'published',
    'where[serviceType][equals]': serviceType,
    'where[slug][not_equals]': excludeSlug,
    sort: '-publishedAt',
    depth: '1',
    limit: String(limit),
  })

  return (data?.docs || []).map(resolvePostImages)
}
