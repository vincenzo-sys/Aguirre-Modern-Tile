import Link from 'next/link'
import Image from 'next/image'
import { Metadata } from 'next'
import { ArrowRight, Calendar } from 'lucide-react'
import { getPublishedPosts, resolveCmsImageUrl } from '@/lib/cms'

export const metadata: Metadata = {
  title: 'Blog | Aguirre Modern Tile',
  description: 'Tile installation tips, project spotlights, and industry news from the experts at Aguirre Modern Tile in Greater Boston.',
  alternates: { canonical: '/blog' },
}

const defaultPosts = [
  {
    id: '1',
    title: '5 Signs Your Shower Needs Waterproofing',
    slug: 'shower-waterproofing-signs',
    excerpt: 'Catching waterproofing issues early can save you thousands. Here are the warning signs every homeowner should know before water damage becomes a costly problem.',
    featuredImage: { url: '/images/shower1.jpg', alt: 'Shower waterproofing' },
    author: 'Christian Aguirre',
    category: { name: 'Tips & Techniques', slug: 'tips' },
    publishedAt: '2024-11-15',
  },
  {
    id: '2',
    title: 'KERDI-BOARD vs GO-BOARD: Which Is Right for Your Shower?',
    slug: 'kerdi-board-vs-go-board',
    excerpt: 'Both are excellent waterproofing systems, but each has strengths. We break down the pros and cons so you can make the right choice for your project.',
    featuredImage: { url: '/images/bathroom-service1.jpg', alt: 'Waterproofing board comparison' },
    author: 'Christian Aguirre',
    category: { name: 'Tips & Techniques', slug: 'tips' },
    publishedAt: '2024-10-22',
  },
  {
    id: '3',
    title: 'Cambridge Master Bath Transformation',
    slug: 'cambridge-master-bath-transformation',
    excerpt: 'See how we transformed a dated 1990s master bathroom into a modern spa-like retreat with large format porcelain, a curbless shower, and heated floors.',
    featuredImage: { url: '/images/bathroom-service2.jpg', alt: 'Cambridge bathroom transformation' },
    author: 'Christian Aguirre',
    category: { name: 'Project Spotlight', slug: 'spotlight' },
    publishedAt: '2024-09-18',
  },
  {
    id: '4',
    title: '2024 Tile Trends: What We\'re Seeing in Greater Boston',
    slug: '2024-tile-trends-boston',
    excerpt: 'From zellige to large format slabs, here are the tile trends dominating Greater Boston renovations this year — and which ones are worth the investment.',
    featuredImage: { url: '/images/backsplash1.jpg', alt: 'Tile trends 2024' },
    author: 'Christian Aguirre',
    category: { name: 'Industry News', slug: 'news' },
    publishedAt: '2024-08-05',
  },
]

const categoryColors: Record<string, string> = {
  tips: 'bg-blue-100 text-blue-800',
  'tips-techniques': 'bg-blue-100 text-blue-800',
  spotlight: 'bg-green-100 text-green-800',
  'project-spotlight': 'bg-green-100 text-green-800',
  news: 'bg-purple-100 text-purple-800',
  'industry-news': 'bg-purple-100 text-purple-800',
  'home-improvement': 'bg-orange-100 text-orange-800',
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function getCategoryColor(cat: any): string {
  const slug = typeof cat === 'object' ? cat?.slug : cat
  return categoryColors[slug] || 'bg-gray-100 text-gray-800'
}

function getCategoryName(cat: any): string {
  if (typeof cat === 'object' && cat?.name) return cat.name
  return String(cat || 'General')
}

function getImageUrl(img: any): string {
  if (!img) return '/images/bathroom-service1.jpg'
  if (typeof img === 'string') return img
  return img.url || '/images/bathroom-service1.jpg'
}

function getImageAlt(img: any, fallback: string): string {
  if (typeof img === 'object' && img?.alt) return img.alt
  return fallback
}

export default async function BlogPage() {
  let posts: any[] = defaultPosts

  try {
    const result = await getPublishedPosts({}, 1, 50)
    if (result.docs.length > 0) {
      posts = result.docs
    }
  } catch {
    // CMS not available — use defaults
  }

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 to-primary-900 text-white section-padding">
        <div className="container-custom">
          <div className="max-w-3xl">
            <h1 className="heading-primary text-white mb-6">Blog</h1>
            <p className="text-xl text-gray-300">
              Tips, project spotlights, and industry insights from 15+ years of
              tile installation in Greater Boston.
            </p>
          </div>
        </div>
      </section>

      {/* Posts Grid */}
      <section className="section-padding">
        <div className="container-custom">
          {posts.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-500 text-lg">No blog posts yet. Check back soon!</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {posts.map((post) => (
                <article key={post.id || post.slug} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                  <Link href={`/blog/${post.slug}`}>
                    <div className="relative aspect-[16/10] overflow-hidden">
                      <Image
                        src={getImageUrl(post.featuredImage)}
                        alt={getImageAlt(post.featuredImage, post.title)}
                        fill
                        className="object-cover hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  </Link>
                  <div className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getCategoryColor(post.category)}`}>
                        {getCategoryName(post.category)}
                      </span>
                      {post.publishedAt && (
                        <span className="flex items-center gap-1 text-sm text-gray-500">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(post.publishedAt)}
                        </span>
                      )}
                    </div>
                    <Link href={`/blog/${post.slug}`}>
                      <h2 className="text-xl font-bold text-gray-900 mb-2 hover:text-primary-600 transition-colors">
                        {post.title}
                      </h2>
                    </Link>
                    <p className="text-gray-600 mb-4 line-clamp-3">{post.excerpt}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">By {post.author || 'Christian Aguirre'}</span>
                      <Link
                        href={`/blog/${post.slug}`}
                        className="text-primary-600 hover:text-primary-700 font-semibold text-sm flex items-center gap-1"
                      >
                        Read More <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding bg-primary-600 text-white">
        <div className="container-custom text-center">
          <h2 className="heading-secondary text-white mb-4">Ready to Get Started?</h2>
          <p className="text-xl text-primary-100 mb-8 max-w-2xl mx-auto">
            Upload photos of your project and receive a same-day estimate.
            No commitment required.
          </p>
          <a href="/contact" className="btn-cta">
            Get Your Free Estimate
          </a>
        </div>
      </section>
    </>
  )
}
