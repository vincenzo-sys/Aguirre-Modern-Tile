import { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { Calendar, User, ArrowLeft } from 'lucide-react'
import { getPostBySlug, getPublishedPosts } from '@/lib/cms'
import { notFound } from 'next/navigation'
import RichText from '@/components/blog/RichText'

const categoryColors: Record<string, string> = {
  tips: 'bg-blue-100 text-blue-800',
  'tips-techniques': 'bg-blue-100 text-blue-800',
  spotlight: 'bg-green-100 text-green-800',
  'project-spotlight': 'bg-green-100 text-green-800',
  news: 'bg-purple-100 text-purple-800',
  'industry-news': 'bg-purple-100 text-purple-800',
  'home-improvement': 'bg-orange-100 text-orange-800',
}

// Default posts for when CMS is not available
const defaultPosts: Record<string, any> = {
  'shower-waterproofing-signs': {
    title: '5 Signs Your Shower Needs Waterproofing',
    slug: 'shower-waterproofing-signs',
    excerpt: 'Catching waterproofing issues early can save you thousands.',
    plainContent: `Your shower might look fine on the surface, but hidden moisture problems can cause thousands of dollars in damage if left unchecked. After 15+ years of tile installation in Greater Boston, we've seen it all. Here are the five warning signs that your shower needs professional waterproofing.

1. Loose or Hollow-Sounding Tiles

Tap your shower tiles gently. If they sound hollow instead of solid, water may have gotten behind them and broken the bond with the substrate. This is one of the earliest warning signs.

2. Crumbling or Missing Grout

Grout that's cracking, falling out, or turning dark in spots isn't just cosmetic — it's letting water through. While regrouting helps short-term, it may indicate the underlying waterproofing has failed.

3. Stains on the Ceiling Below

If you have a bathroom above another room, water stains on the ceiling below are a clear sign of a leak. Don't wait — this means water is actively penetrating through the floor.

4. Musty Smell That Won't Go Away

A persistent musty or moldy smell in your bathroom, even after cleaning, often means moisture is trapped behind walls or under the floor. This is a health concern as well as a structural one.

5. Soft or Spongy Spots on the Floor

If the floor near your shower feels soft when you step on it, the subfloor may be rotting from water exposure. This requires immediate attention.

What to Do Next

If you're seeing any of these signs, don't panic — but don't wait either. A professional assessment can determine the extent of the damage and the best repair approach. At Aguirre Modern Tile, we use KERDI-BOARD and GO-BOARD waterproofing systems that provide a complete moisture barrier, protecting your home for 20+ years.

Contact us for a free estimate — send photos and we'll assess your situation within 24 hours.`,
    featuredImage: '/images/shower1.jpg',
    author: 'Christian Aguirre',
    category: { name: 'Tips & Techniques', slug: 'tips' },
    serviceType: 'shower',
    publishedAt: '2024-11-15',
    seo: {
      metaTitle: '5 Signs Your Shower Needs Waterproofing | Aguirre Modern Tile',
      metaDescription: 'Learn the warning signs that your shower waterproofing has failed. Expert advice from 15+ years of tile installation in Greater Boston.',
    },
  },
  'kerdi-board-vs-go-board': {
    title: 'KERDI-BOARD vs GO-BOARD: Which Is Right for Your Shower?',
    slug: 'kerdi-board-vs-go-board',
    excerpt: 'Both are excellent waterproofing systems, but each has strengths.',
    plainContent: `When it comes to waterproofing your shower, two products dominate the professional market: Schluter KERDI-BOARD and Johns Manville GO-BOARD. We've installed hundreds of showers with both systems, so here's our honest comparison.

KERDI-BOARD (Schluter Systems)

KERDI-BOARD is an extruded polystyrene foam panel with a fleece webbing on both sides. It's been the industry standard for years.

Pros:
- Complete system with matching drains, niches, and accessories
- Excellent warranty when using all Schluter components
- Widely available at specialty tile shops
- Proven track record over decades

Cons:
- More expensive overall (system approach means all Schluter)
- Requires Schluter-specific thin-set for full warranty
- Panels can be fragile during transport

GO-BOARD (Johns Manville)

GO-BOARD is a newer competitor made from extruded polystyrene with a cementitious coating. It's gaining popularity fast.

Pros:
- Works with any modified thin-set (no proprietary requirement)
- Slightly more affordable per square foot
- More rigid than KERDI-BOARD — easier to handle
- Integrated waterproofing — no separate membrane needed

Cons:
- Smaller accessory ecosystem
- Less brand recognition (though growing fast)
- Fewer integrated system components

Our Recommendation

For most homeowners, both systems deliver excellent results. We typically recommend KERDI-BOARD for complex custom showers where the full system integration matters, and GO-BOARD for straightforward shower builds where cost savings are a priority.

Want to discuss which system is right for your project? Contact us for a free consultation.`,
    featuredImage: '/images/bathroom-service1.jpg',
    author: 'Christian Aguirre',
    category: { name: 'Tips & Techniques', slug: 'tips' },
    serviceType: 'bathroom',
    publishedAt: '2024-10-22',
    seo: {
      metaTitle: 'KERDI-BOARD vs GO-BOARD Comparison | Aguirre Modern Tile',
      metaDescription: 'Honest comparison of KERDI-BOARD and GO-BOARD waterproofing systems from a professional tile installer with 15+ years of experience.',
    },
  },
  'cambridge-master-bath-transformation': {
    title: 'Cambridge Master Bath Transformation',
    slug: 'cambridge-master-bath-transformation',
    excerpt: 'See how we transformed a dated 1990s master bathroom into a modern spa-like retreat.',
    plainContent: `This Cambridge homeowner came to us with a common problem: a 1990s master bathroom that was functional but dated. They wanted a complete transformation into a modern, spa-like retreat.

The Vision: A curbless walk-in shower with a linear drain, large format porcelain tiles (24x48) throughout, a built-in shower niche, heated floors, and a clean modern aesthetic with warm gray tones.

Week 1 — Demolition and Prep: We removed everything down to the studs and subfloor, revealing water damage around the old shower pan.

Week 2 — Waterproofing and Systems: KERDI-BOARD throughout the shower area and heated floor system installation.

Week 3 — Tile Installation: Large format tiles with a leveling system for perfectly flat walls.

Week 4 — Finishing: Grouting, sealing, fixtures, and glass shower door.

Total project time: 4 weeks. The finished bathroom is barely recognizable — the large format tiles create spaciousness, the curbless shower makes the room feel even bigger, and heated floors are a luxury.

Thinking about transforming your bathroom? Send us photos and we'll provide a free estimate within 24 hours.`,
    featuredImage: '/images/bathroom-service2.jpg',
    author: 'Christian Aguirre',
    category: { name: 'Project Spotlight', slug: 'spotlight' },
    serviceType: 'bathroom',
    publishedAt: '2024-09-18',
    seo: {
      metaTitle: 'Cambridge Master Bath Transformation | Aguirre Modern Tile',
      metaDescription: 'See how we transformed a dated 1990s master bathroom into a modern spa retreat with large format tile, curbless shower, and heated floors.',
    },
  },
  '2024-tile-trends-boston': {
    title: '2024 Tile Trends: What We\'re Seeing in Greater Boston',
    slug: '2024-tile-trends-boston',
    excerpt: 'From zellige to large format slabs, here are the tile trends dominating Greater Boston renovations.',
    plainContent: `After completing over 220 bathroom projects this year alone, we have a pretty good pulse on what Greater Boston homeowners are choosing. Here are the tile trends we're seeing the most.

1. Large Format Tiles (24x48 and Bigger) — The biggest trend by far. Fewer grout lines, modern look.

2. Zellige and Handmade-Look Tiles — Moroccan-style tiles with handmade character are everywhere.

3. Wood-Look Porcelain Planks — Nearly indistinguishable from real hardwood with better durability.

4. Matte Finishes Over Glossy — Sophisticated, contemporary feel that hides water spots.

5. Bold Patterns in Small Spaces — Powder rooms and laundry rooms as design showcases.

Whatever tile style you choose, make sure it's installed with proper waterproofing, full thinset coverage, and attention to detail. That's what we do at Aguirre Modern Tile.

Ready to start your tile project? Get a free estimate today.`,
    featuredImage: '/images/backsplash1.jpg',
    author: 'Christian Aguirre',
    category: { name: 'Industry News', slug: 'news' },
    serviceType: 'general',
    publishedAt: '2024-08-05',
    seo: {
      metaTitle: '2024 Tile Trends in Greater Boston | Aguirre Modern Tile',
      metaDescription: 'Top tile trends for 2024 in Greater Boston: large format, zellige, wood-look planks, matte finishes, and bold patterns.',
    },
  },
}

const serviceCtaMap: Record<string, { label: string; href: string }> = {
  bathroom: { label: 'Bathroom Tile Installation', href: '/services/bathroom-tile-installation' },
  shower: { label: 'Shower Tile Installation', href: '/services/shower-tile-installation' },
  floor: { label: 'Floor Tile Installation', href: '/services/floor-tile-installation' },
  backsplash: { label: 'Backsplash Installation', href: '/services/backsplash-tile-installation' },
  repair: { label: 'Tile Repair', href: '/services/tile-repair' },
  reglazing: { label: 'Tile Reglazing', href: '/services/tile-reglazing' },
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function getCategorySlug(cat: any): string {
  if (typeof cat === 'object' && cat?.slug) return cat.slug
  return String(cat || '')
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

async function getPost(slug: string) {
  // Try CMS first
  const cmsPost = await getPostBySlug(slug)
  if (cmsPost) return { ...cmsPost, isRichText: true }

  // Fall back to defaults
  const def = defaultPosts[slug]
  if (def) return { ...def, isRichText: false }

  return null
}

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  try {
    const result = await getPublishedPosts({}, 1, 100)
    if (result.docs.length > 0) {
      return result.docs.map((p: any) => ({ slug: p.slug }))
    }
  } catch {
    // CMS not available
  }
  return Object.keys(defaultPosts).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) return {}

  const title = post.seo?.metaTitle || `${post.title} | Aguirre Modern Tile`
  const description = post.seo?.metaDescription || post.excerpt

  return {
    title,
    description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      title,
      description,
      type: 'article',
      publishedTime: post.publishedAt,
      images: getImageUrl(post.featuredImage) ? [getImageUrl(post.featuredImage)] : undefined,
    },
  }
}

function ArticleJsonLd({ post, slug }: { post: any; slug: string }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    image: getImageUrl(post.featuredImage),
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    author: {
      '@type': 'Person',
      name: post.author || 'Christian Aguirre',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Aguirre Modern Tile',
      url: 'https://www.aguirremoderntile.com',
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://www.aguirremoderntile.com/blog/${slug}`,
    },
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

function FaqJsonLd({ items }: { items: any[] }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((faq: any) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

export default async function BlogDetailPage({ params }: Props) {
  const { slug } = await params
  const post = await getPost(slug)

  if (!post) {
    notFound()
  }

  const catSlug = getCategorySlug(post.category)
  const serviceLink = post.serviceType ? serviceCtaMap[post.serviceType] : null

  return (
    <>
      <ArticleJsonLd post={post} slug={slug} />
      {post.faqItems && post.faqItems.length > 0 && (
        <FaqJsonLd items={post.faqItems} />
      )}

      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 to-primary-900 text-white section-padding">
        <div className="container-custom">
          <div className="max-w-3xl">
            <Link href="/blog" className="text-primary-300 hover:text-primary-200 mb-4 inline-flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Blog
            </Link>
            <div className="flex items-center gap-3 mb-4">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${categoryColors[catSlug] || 'bg-gray-100 text-gray-800'}`}>
                {getCategoryName(post.category)}
              </span>
            </div>
            <h1 className="heading-primary text-white mb-6">{post.title}</h1>
            <div className="flex items-center gap-6 text-gray-300">
              <span className="flex items-center gap-2">
                <User className="w-4 h-4" />
                {post.author || 'Christian Aguirre'}
              </span>
              {post.publishedAt && (
                <span className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {formatDate(post.publishedAt)}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Featured Image */}
      <section className="container-custom -mt-8 relative z-10 mb-12">
        <div className="max-w-4xl mx-auto">
          <div className="relative aspect-[21/9] rounded-2xl overflow-hidden shadow-xl">
            <Image
              src={getImageUrl(post.featuredImage)}
              alt={getImageAlt(post.featuredImage, post.title)}
              fill
              className="object-cover"
              priority
            />
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="section-padding pt-0">
        <div className="container-custom">
          <div className="max-w-3xl mx-auto">
            {post.isRichText && post.content ? (
              <div className="prose prose-lg prose-gray max-w-none prose-headings:text-gray-900 prose-a:text-primary-600">
                <RichText data={post.content} />
              </div>
            ) : post.plainContent ? (
              <div className="prose prose-lg prose-gray max-w-none prose-headings:text-gray-900 whitespace-pre-line">
                {post.plainContent}
              </div>
            ) : null}

            {/* Tags */}
            {post.tags && post.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t">
                {post.tags.map((tag: any) => {
                  const tagName = typeof tag === 'object' ? tag.name : tag?.tag || tag
                  return (
                    <span
                      key={tagName}
                      className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded-full"
                    >
                      #{tagName}
                    </span>
                  )
                })}
              </div>
            )}

            {/* FAQ Accordion */}
            {post.faqItems && post.faqItems.length > 0 && (
              <div className="mt-12">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h2>
                <div className="space-y-4">
                  {post.faqItems.map((faq: any, i: number) => (
                    <details key={i} className="group border border-gray-200 rounded-lg">
                      <summary className="flex items-center justify-between cursor-pointer p-4 font-semibold text-gray-900 hover:bg-gray-50 rounded-lg">
                        {faq.question}
                        <span className="ml-2 text-gray-400 group-open:rotate-180 transition-transform">&#9662;</span>
                      </summary>
                      <div className="px-4 pb-4 text-gray-600">
                        {faq.answer}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding bg-primary-600 text-white">
        <div className="container-custom text-center">
          <h2 className="heading-secondary text-white mb-4">
            {serviceLink
              ? `Need ${serviceLink.label}?`
              : 'Ready to Get Started?'}
          </h2>
          <p className="text-xl text-primary-100 mb-8">
            Send us photos and get a same-day estimate.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/contact" className="btn-cta">
              Get Your Free Estimate
            </a>
            {serviceLink && (
              <Link
                href={serviceLink.href}
                className="inline-block px-8 py-3 border-2 border-white text-white rounded-lg font-semibold hover:bg-white/10 transition-colors"
              >
                Learn About {serviceLink.label}
              </Link>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
