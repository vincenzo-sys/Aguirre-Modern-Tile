import type { MetadataRoute } from 'next'
import { locationSlugs } from '@/data/locations'
import { getPublishedPosts } from '@/lib/cms'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://aguirremoderntile.com'

  // Core marketing pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${baseUrl}/services`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/gallery`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/process`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/book-online`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    // Tile Match Kit — top-of-funnel offer page, ranked high on purpose since
    // "tile samples" searches are how shoppers enter before they hire.
    { url: `${baseUrl}/tile-samples`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
  ]

  // Service detail pages
  const serviceSlugs = [
    'bathroom-tile', 'shower-tile', 'floor-tile',
    'backsplash-tile', 'tile-repair', 'tile-reglazing',
  ]
  const servicePages: MetadataRoute.Sitemap = serviceSlugs.map((slug) => ({
    url: `${baseUrl}/services/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  // Blog posts from Payload CMS (with fallback defaults)
  let blogPages: MetadataRoute.Sitemap = []
  try {
    const { docs } = await getPublishedPosts({}, 1, 100)
    if (docs.length > 0) {
      blogPages = docs.map((post: any) => ({
        url: `${baseUrl}/blog/${post.slug}`,
        lastModified: new Date(post.updatedAt || post.publishedAt),
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      }))
    }
  } catch {
    // CMS not available — use default slugs
  }
  if (blogPages.length === 0) {
    const defaultBlogSlugs = [
      'shower-waterproofing-signs',
      'kerdi-board-vs-go-board',
      'cambridge-master-bath-transformation',
      '2024-tile-trends-boston',
    ]
    blogPages = defaultBlogSlugs.map((slug) => ({
      url: `${baseUrl}/blog/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }))
  }

  // Quote pages
  const quoteTypes = ['bathroom', 'shower', 'kitchen-floor', 'backsplash', 'other']
  const quotePages: MetadataRoute.Sitemap = quoteTypes.map((type) => ({
    url: `${baseUrl}/quote/${type}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }))

  // Location-based SEO pages (7 service types × 491 locations)
  const locationServicePrefixes = [
    'tilecontractor',
    'bathroomtileinstallation',
    'showertileinstallation',
    'floortileinstallation',
    'backsplashtileinstallation',
    'tilerepair',
    'tilereglazing',
  ]
  const locationPages: MetadataRoute.Sitemap = locationServicePrefixes.flatMap(
    (prefix) =>
      locationSlugs.map((slug) => ({
        url: `${baseUrl}/${prefix}/${slug}`,
        lastModified: new Date(),
        changeFrequency: 'monthly' as const,
        priority: 0.4,
      }))
  )

  return [
    ...staticPages,
    ...servicePages,
    ...blogPages,
    ...quotePages,
    ...locationPages,
  ]
}
