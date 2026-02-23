import { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { Calendar, User, Tag, ArrowRight } from 'lucide-react'
import { getPayloadClient } from '@/lib/payload'
import { notFound } from 'next/navigation'
import { RichText } from '@payloadcms/richtext-lexical/react'

const categoryLabels: Record<string, string> = {
  tips: 'Tips & Techniques',
  spotlight: 'Project Spotlight',
  news: 'Industry News',
  'home-improvement': 'Home Improvement',
}

const categoryColors: Record<string, string> = {
  tips: 'bg-blue-100 text-blue-800',
  spotlight: 'bg-green-100 text-green-800',
  news: 'bg-purple-100 text-purple-800',
  'home-improvement': 'bg-orange-100 text-orange-800',
}

interface BlogPostData {
  title: string
  slug: string
  excerpt: string
  content: any // Lexical rich text JSON or plain string for defaults
  featuredImage: string
  author: string
  category: string
  publishedAt: string
  metaTitle: string
  metaDescription: string
  isRichText: boolean
}

const defaultPosts: Record<string, BlogPostData> = {
  'shower-waterproofing-signs': {
    title: '5 Signs Your Shower Needs Waterproofing',
    slug: 'shower-waterproofing-signs',
    excerpt: 'Catching waterproofing issues early can save you thousands.',
    content: `Your shower might look fine on the surface, but hidden moisture problems can cause thousands of dollars in damage if left unchecked. After 15+ years of tile installation in Greater Boston, we've seen it all. Here are the five warning signs that your shower needs professional waterproofing.

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
    category: 'tips',
    publishedAt: '2024-11-15',
    metaTitle: '5 Signs Your Shower Needs Waterproofing | Aguirre Modern Tile',
    metaDescription: 'Learn the warning signs that your shower waterproofing has failed. Expert advice from 15+ years of tile installation in Greater Boston.',
    isRichText: false,
  },
  'kerdi-board-vs-go-board': {
    title: 'KERDI-BOARD vs GO-BOARD: Which Is Right for Your Shower?',
    slug: 'kerdi-board-vs-go-board',
    excerpt: 'Both are excellent waterproofing systems, but each has strengths.',
    content: `When it comes to waterproofing your shower, two products dominate the professional market: Schluter KERDI-BOARD and Johns Manville GO-BOARD. We've installed hundreds of showers with both systems, so here's our honest comparison.

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

The most important thing isn't which board you choose — it's that your installer uses proper waterproofing in the first place. Too many contractors skip this step entirely, leading to costly failures down the road.

Want to discuss which system is right for your project? Contact us for a free consultation.`,
    featuredImage: '/images/bathroom-service1.jpg',
    author: 'Christian Aguirre',
    category: 'tips',
    publishedAt: '2024-10-22',
    metaTitle: 'KERDI-BOARD vs GO-BOARD Comparison | Aguirre Modern Tile',
    metaDescription: 'Honest comparison of KERDI-BOARD and GO-BOARD waterproofing systems from a professional tile installer with 15+ years of experience.',
    isRichText: false,
  },
  'cambridge-master-bath-transformation': {
    title: 'Cambridge Master Bath Transformation',
    slug: 'cambridge-master-bath-transformation',
    excerpt: 'See how we transformed a dated 1990s master bathroom into a modern spa-like retreat.',
    content: `This Cambridge homeowner came to us with a common problem: a 1990s master bathroom that was functional but dated. Beige 4x4 tiles, a prefab shower insert, and vinyl flooring. They wanted a complete transformation into a modern, spa-like retreat.

The Vision

The homeowner wanted:
- A curbless walk-in shower with a linear drain
- Large format porcelain tiles (24x48) throughout
- A built-in shower niche for storage
- Heated floors under the tile
- A clean, modern aesthetic with warm gray tones

The Process

Week 1 — Demolition and Prep: We removed everything down to the studs and subfloor. This revealed some water damage around the old shower pan (no waterproofing membrane had been installed originally — a common issue in 1990s construction).

Week 2 — Waterproofing and Systems: We installed KERDI-BOARD throughout the shower area, creating a complete waterproof envelope. The heated floor system was laid out and tested before any tile went down.

Week 3 — Tile Installation: The large format tiles required careful planning for layout and cuts. We used a leveling system to ensure perfectly flat walls and consistent grout lines throughout.

Week 4 — Finishing: Grouting, sealing, fixtures, and glass shower door installation. The linear drain was integrated seamlessly into the floor slope.

The Result

The finished bathroom is barely recognizable. The large format tiles create a sense of spaciousness, the curbless shower makes the room feel even bigger, and the heated floors are a luxury the homeowner says they can't live without.

Total project time: 4 weeks
Investment: $14,500 (including all materials and labor)

Thinking about transforming your bathroom? Send us photos and we'll provide a free estimate within 24 hours.`,
    featuredImage: '/images/bathroom-service2.jpg',
    author: 'Christian Aguirre',
    category: 'spotlight',
    publishedAt: '2024-09-18',
    metaTitle: 'Cambridge Master Bath Transformation | Aguirre Modern Tile',
    metaDescription: 'See how we transformed a dated 1990s master bathroom into a modern spa retreat with large format tile, curbless shower, and heated floors.',
    isRichText: false,
  },
  '2024-tile-trends-boston': {
    title: '2024 Tile Trends: What We\'re Seeing in Greater Boston',
    slug: '2024-tile-trends-boston',
    excerpt: 'From zellige to large format slabs, here are the tile trends dominating Greater Boston renovations.',
    content: `After completing over 220 bathroom projects this year alone, we have a pretty good pulse on what Greater Boston homeowners are choosing. Here are the tile trends we're seeing the most — and our take on which ones are worth the investment.

1. Large Format Tiles (24x48 and Bigger)

The biggest trend by far. Large format tiles create a seamless, modern look with fewer grout lines. They work beautifully on floors and shower walls. The catch: they require a perfectly level substrate and an experienced installer. We love them.

2. Zellige and Handmade-Look Tiles

Zellige tiles from Morocco (and zellige-inspired tiles) are everywhere. Their slightly imperfect, handmade quality adds warmth and character to kitchens and bathrooms. They're pricier than standard tiles but make a stunning statement.

3. Wood-Look Porcelain Planks

Wood-look tiles have been popular for years, but the technology keeps getting better. Today's porcelain planks are nearly indistinguishable from real hardwood, with the durability and water resistance of tile.

4. Matte Finishes Over Glossy

The shiny, glossy tile look is fading. Boston homeowners are overwhelmingly choosing matte and satin finishes for a more sophisticated, contemporary feel. Bonus: matte tiles hide water spots and fingerprints better.

5. Bold Patterns in Small Spaces

Powder rooms and laundry rooms are becoming design showcases. We're seeing bold geometric patterns, colorful cement tiles, and dramatic mosaic floors in these smaller spaces where homeowners feel free to take risks.

Our Advice

Trends come and go, but quality installation lasts forever. Whatever tile style you choose, make sure it's installed with proper waterproofing, full thinset coverage, and attention to detail. That's what we do at Aguirre Modern Tile — beautiful installations that last.

Ready to start your tile project? Get a free estimate today.`,
    featuredImage: '/images/backsplash1.jpg',
    author: 'Christian Aguirre',
    category: 'news',
    publishedAt: '2024-08-05',
    metaTitle: '2024 Tile Trends in Greater Boston | Aguirre Modern Tile',
    metaDescription: 'Top tile trends for 2024 in Greater Boston: large format, zellige, wood-look planks, matte finishes, and bold patterns.',
    isRichText: false,
  },
}

const validSlugs = Object.keys(defaultPosts)

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

async function getPost(slug: string): Promise<BlogPostData | null> {
  const defaults = defaultPosts[slug]

  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'blog-posts',
      where: { slug: { equals: slug } },
      limit: 1,
    })

    if (result.docs.length > 0) {
      const p: any = result.docs[0]
      return {
        title: p.title,
        slug: p.slug,
        excerpt: p.excerpt,
        content: p.content,
        featuredImage: p.featuredImage || defaults?.featuredImage || '/images/bathroom-service1.jpg',
        author: p.author || 'Christian Aguirre',
        category: p.category || 'tips',
        publishedAt: p.publishedAt,
        metaTitle: p.metaTitle || `${p.title} | Aguirre Modern Tile`,
        metaDescription: p.metaDescription || p.excerpt,
        isRichText: true,
      }
    }
  } catch {
    // Payload not initialized yet
  }

  return defaults || null
}

export async function generateStaticParams() {
  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'blog-posts',
      where: { status: { equals: 'published' } },
      limit: 100,
    })
    if (result.docs.length > 0) {
      return result.docs.map((p: any) => ({ slug: p.slug }))
    }
  } catch {
    // Payload not initialized yet
  }
  return validSlugs.map((slug) => ({ slug }))
}

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) return {}
  return {
    title: post.metaTitle,
    description: post.metaDescription,
  }
}

export default async function BlogDetailPage({ params }: Props) {
  const { slug } = await params
  const post = await getPost(slug)

  if (!post) {
    notFound()
  }

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 to-primary-900 text-white section-padding">
        <div className="container-custom">
          <div className="max-w-3xl">
            <Link href="/blog" className="text-primary-300 hover:text-primary-200 mb-4 inline-block">
              &larr; Back to Blog
            </Link>
            <div className="flex items-center gap-3 mb-4">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${categoryColors[post.category] || 'bg-gray-100 text-gray-800'}`}>
                {categoryLabels[post.category] || post.category}
              </span>
            </div>
            <h1 className="heading-primary text-white mb-6">{post.title}</h1>
            <div className="flex items-center gap-6 text-gray-300">
              <span className="flex items-center gap-2">
                <User className="w-4 h-4" />
                {post.author}
              </span>
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {formatDate(post.publishedAt)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Image */}
      <section className="container-custom -mt-8 relative z-10 mb-12">
        <div className="max-w-4xl mx-auto">
          <div className="relative aspect-[21/9] rounded-2xl overflow-hidden shadow-xl">
            <Image
              src={post.featuredImage}
              alt={post.title}
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
            ) : (
              <div className="prose prose-lg prose-gray max-w-none prose-headings:text-gray-900 whitespace-pre-line">
                {post.content}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding bg-primary-600 text-white">
        <div className="container-custom text-center">
          <h2 className="heading-secondary text-white mb-4">Ready to Get Started?</h2>
          <p className="text-xl text-primary-100 mb-8">
            Send us photos and get a same-day estimate.
          </p>
          <a href="/contact" className="btn-cta">
            Get Your Free Estimate
          </a>
        </div>
      </section>
    </>
  )
}
