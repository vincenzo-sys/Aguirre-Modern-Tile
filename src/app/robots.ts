import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://aguirremoderntile.com'

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard/', '/login', '/api/', '/work-orders/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
