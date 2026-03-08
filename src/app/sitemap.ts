import type { MetadataRoute } from 'next'
import { locationSlugs } from '@/data/locations'

export default function sitemap(): MetadataRoute.Sitemap {
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

  // Blog posts (defaults — CMS posts would need dynamic fetch)
  const blogSlugs = [
    'shower-waterproofing-signs',
    'kerdi-board-vs-go-board',
    'cambridge-master-bath-transformation',
    '2024-tile-trends-boston',
  ]
  const blogPages: MetadataRoute.Sitemap = blogSlugs.map((slug) => ({
    url: `${baseUrl}/blog/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))

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
