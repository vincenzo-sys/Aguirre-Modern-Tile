import { getPublishedPosts } from '@/lib/cms'

export const revalidate = 3600 // regenerate hourly

const SITE_URL = 'https://www.aguirremoderntile.com'

// Hardcoded fallback so the feed is never empty when the CMS is offline —
// mirrors the default posts the blog pages fall back to (same graceful-default
// pattern used across the marketing site).
const FALLBACK_ITEMS = [
  {
    title: '5 Signs Your Shower Needs Waterproofing',
    slug: 'shower-waterproofing-signs',
    excerpt: 'Catching waterproofing issues early can save you thousands.',
    publishedAt: '2024-11-15',
  },
  {
    title: 'KERDI-BOARD vs GO-BOARD: Which Is Right for Your Shower?',
    slug: 'kerdi-board-vs-go-board',
    excerpt: 'Both are excellent waterproofing systems, but each has strengths.',
    publishedAt: '2024-10-22',
  },
  {
    title: 'Cambridge Master Bath Transformation',
    slug: 'cambridge-master-bath-transformation',
    excerpt: 'See how we transformed a dated 1990s master bathroom into a modern spa-like retreat.',
    publishedAt: '2024-09-18',
  },
  {
    title: "2024 Tile Trends: What We're Seeing in Greater Boston",
    slug: '2024-tile-trends-boston',
    excerpt: 'From zellige to large format slabs, here are the tile trends dominating Greater Boston renovations.',
    publishedAt: '2024-08-05',
  },
]

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!
  )
}

type FeedItem = { title: string; slug: string; excerpt?: string; publishedAt?: string }

export async function GET() {
  let items: FeedItem[] = FALLBACK_ITEMS
  try {
    const result = await getPublishedPosts({}, 1, 30)
    if (result.docs.length > 0) {
      items = result.docs.map((p: { title: string; slug: string; excerpt?: string; publishedAt?: string }) => ({
        title: p.title,
        slug: p.slug,
        excerpt: p.excerpt,
        publishedAt: p.publishedAt,
      }))
    }
  } catch {
    // CMS unavailable — keep the fallback items.
  }

  const xmlItems = items
    .map((item) => {
      const url = `${SITE_URL}/blog/${item.slug}`
      const pubDate = item.publishedAt
        ? new Date(item.publishedAt).toUTCString()
        : new Date().toUTCString()
      return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pubDate}</pubDate>
      ${item.excerpt ? `<description>${escapeXml(item.excerpt)}</description>` : ''}
    </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Aguirre Modern Tile Blog</title>
    <link>${SITE_URL}/blog</link>
    <description>Tile installation tips, project spotlights, and industry news from Greater Boston's tile specialists.</description>
    <language>en-us</language>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${xmlItems}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
