import { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { CheckCircle, ArrowRight } from 'lucide-react'
import { getPayloadClient } from '@/lib/payload'
import { notFound } from 'next/navigation'

interface ServiceData {
  title: string
  slug: string
  description: string
  heroDescription: string
  priceRange: string
  image: string
  features: string[]
  processSteps: { title: string; description: string }[]
  galleryImages: { image: string; alt: string }[]
  metaTitle: string
  metaDescription: string
}

const defaultServices: Record<string, ServiceData> = {
  'bathroom-tile': {
    title: 'Bathroom Tile Installation',
    slug: 'bathroom-tile',
    description: 'Complete bathroom transformations with expert waterproofing and precision tile work.',
    heroDescription: 'Complete bathroom transformations with expert waterproofing and precision tile work. From simple updates to full renovations, we handle it all.',
    priceRange: '$4,500 - $15,000+',
    image: '/images/bathroom-service1.jpg',
    features: ['Complete bathroom renovations', 'Custom shower builds', 'Heated floor installation', 'Waterproof membrane systems', 'Niche and bench construction', 'Tub surrounds', 'Vanity backsplashes', 'Floor-to-ceiling tile'],
    processSteps: [
      { title: 'Consultation & Estimate', description: 'We review your photos, discuss your vision, and provide a detailed estimate.' },
      { title: 'Demolition & Prep', description: 'Remove old materials, repair substrate, and install waterproof backing.' },
      { title: 'Waterproofing', description: 'Apply KERDI or GO-BOARD systems to create a fully waterproof envelope.' },
      { title: 'Tile Installation', description: 'Expert installation with proper thinset coverage, level lines, and clean cuts.' },
      { title: 'Grouting & Sealing', description: 'Professional grout application and sealing for a finished, durable result.' },
      { title: 'Final Walkthrough', description: 'We review every detail with you and ensure complete satisfaction.' },
    ],
    galleryImages: [
      { image: '/images/bathroom-service1.jpg', alt: 'Bathroom tile installation' },
      { image: '/images/bathroom-service2.jpg', alt: 'Bathroom tile work' },
      { image: '/images/bathroom-service3.jpg', alt: 'Bathroom project' },
    ],
    metaTitle: 'Bathroom Tile Installation | Aguirre Modern Tile',
    metaDescription: 'Expert bathroom tile installation in Greater Boston. Complete bathroom renovations with waterproof systems, custom showers, and heated floors.',
  },
  'shower-tile': {
    title: 'Shower Tile Installation',
    slug: 'shower-tile',
    description: 'Waterproof shower systems built to last.',
    heroDescription: 'Waterproof shower systems built to last. We specialize in KERDI-BOARD and GO-BOARD installations for leak-free showers that stand the test of time.',
    priceRange: '$2,500 - $8,000+',
    image: '/images/shower1.jpg',
    features: ['KERDI-BOARD systems', 'GO-BOARD installations', 'Linear drain installation', 'Custom bench seating', 'Shower niches', 'Glass tile work', 'Curbless showers', 'Steam shower ready'],
    processSteps: [
      { title: 'Design Consultation', description: 'Discuss layout, tile selection, and waterproofing approach.' },
      { title: 'Demolition', description: 'Remove existing shower and prepare the space.' },
      { title: 'Waterproofing', description: 'Install KERDI-BOARD or GO-BOARD for complete waterproofing.' },
      { title: 'Tile Installation', description: 'Precision tile work with proper slope for drainage.' },
      { title: 'Grouting & Finishing', description: 'Seal and finish for a beautiful, lasting result.' },
    ],
    galleryImages: [
      { image: '/images/shower1.jpg', alt: 'Shower tile installation' },
      { image: '/images/gallery1.jpg', alt: 'Shower project' },
      { image: '/images/gallery2.jpg', alt: 'Custom shower' },
    ],
    metaTitle: 'Shower Tile Installation | Aguirre Modern Tile',
    metaDescription: 'Expert shower tile installation in Greater Boston. Waterproof systems, custom showers, linear drains, and bench seating.',
  },
  'floor-tile': {
    title: 'Floor Tile Installation',
    slug: 'floor-tile',
    description: 'Beautiful, durable tile floors for any room.',
    heroDescription: 'Beautiful, durable tile floors for any room. We work with all tile sizes and materials, including large format tiles up to 48".',
    priceRange: '$1,500 - $6,000+',
    image: '/images/floor1.jpg',
    features: ['Large format tiles', 'Pattern installations', 'Heated floor systems', 'Level substrate prep', 'Crack isolation membrane', 'Porcelain & ceramic', 'Natural stone', 'Waterproof underlayment'],
    processSteps: [
      { title: 'Measurement & Planning', description: 'Measure space, plan layout, and order materials.' },
      { title: 'Subfloor Preparation', description: 'Level, repair, and prepare the substrate.' },
      { title: 'Tile Layout', description: 'Dry-lay tiles to plan cuts and pattern.' },
      { title: 'Installation', description: 'Set tiles with proper thinset and spacing.' },
      { title: 'Grouting & Sealing', description: 'Apply grout and sealant for a finished look.' },
    ],
    galleryImages: [
      { image: '/images/floor1.jpg', alt: 'Floor tile installation' },
      { image: '/images/floor2.jpg', alt: 'Floor tile work' },
      { image: '/images/floor3.jpg', alt: 'Floor project' },
    ],
    metaTitle: 'Floor Tile Installation | Aguirre Modern Tile',
    metaDescription: 'Expert floor tile installation in Greater Boston. Large format tiles, patterns, heated floors, and level substrate prep.',
  },
  'backsplash-tile': {
    title: 'Backsplash Tile Installation',
    slug: 'backsplash-tile',
    description: 'Transform your kitchen or bathroom with a stunning backsplash.',
    heroDescription: 'Transform your kitchen or bathroom with a stunning backsplash. From classic subway tile to intricate mosaics.',
    priceRange: '$800 - $3,000+',
    image: '/images/backsplash1.jpg',
    features: ['Kitchen backsplashes', 'Bathroom backsplashes', 'Subway tile', 'Mosaic patterns', 'Behind-stove installations', 'Full-height backsplashes', 'Custom designs', 'Accent tile work'],
    processSteps: [
      { title: 'Design & Material Selection', description: 'Choose tile style, pattern, and layout.' },
      { title: 'Surface Preparation', description: 'Clean and prep the wall surface.' },
      { title: 'Layout & Installation', description: 'Set tiles with precision alignment.' },
      { title: 'Grouting & Cleanup', description: 'Apply grout and clean for a polished finish.' },
    ],
    galleryImages: [
      { image: '/images/backsplash1.jpg', alt: 'Backsplash tile installation' },
      { image: '/images/backsplash2.jpg', alt: 'Kitchen backsplash' },
      { image: '/images/backsplash3.jpg', alt: 'Backsplash tile work' },
    ],
    metaTitle: 'Backsplash Tile Installation | Aguirre Modern Tile',
    metaDescription: 'Expert backsplash tile installation in Greater Boston. Kitchen and bathroom backsplashes, subway tile, mosaics, and custom patterns.',
  },
  'tile-repair': {
    title: 'Tile Repair',
    slug: 'tile-repair',
    description: 'Fix cracked, loose, or damaged tiles without replacing the entire installation.',
    heroDescription: 'Fix cracked, loose, or damaged tiles without replacing the entire installation. Expert matching and repairs.',
    priceRange: '$200 - $1,500+',
    image: '/images/repair1.jpg',
    features: ['Cracked tile replacement', 'Loose tile repair', 'Grout repair', 'Grout color matching', 'Caulk replacement', 'Water damage repair', 'Tile resealing', 'Spot repairs'],
    processSteps: [
      { title: 'Assessment', description: 'Inspect damage and determine the best repair approach.' },
      { title: 'Tile Removal', description: 'Carefully remove damaged tiles without affecting surrounding ones.' },
      { title: 'Surface Prep', description: 'Clean and prepare the substrate.' },
      { title: 'Replacement & Grouting', description: 'Install new tiles and match grout color.' },
    ],
    galleryImages: [
      { image: '/images/repair1.jpg', alt: 'Tile repair' },
      { image: '/images/repair2.jpg', alt: 'Tile repair work' },
      { image: '/images/repair3.jpg', alt: 'Repair project' },
    ],
    metaTitle: 'Tile Repair | Aguirre Modern Tile',
    metaDescription: 'Expert tile repair in Greater Boston. Fix cracked, loose, or damaged tiles. Grout repair and color matching.',
  },
  'tile-reglazing': {
    title: 'Tile Reglazing',
    slug: 'tile-reglazing',
    description: 'Refresh your existing tile with professional reglazing.',
    heroDescription: 'Refresh your existing tile or bathtub with professional reglazing. A cost-effective way to update your space without full replacement.',
    priceRange: '$500 - $2,000+',
    image: '/images/bathroom1.jpg',
    features: ['Bathtub reglazing', 'Tile resurfacing', 'Color change options', 'Sink reglazing', 'Chip repair', 'Stain removal', 'High-gloss finish', 'Matte finish options'],
    processSteps: [
      { title: 'Surface Assessment', description: 'Evaluate condition and discuss color options.' },
      { title: 'Cleaning & Prep', description: 'Deep clean and prepare surfaces for reglazing.' },
      { title: 'Application', description: 'Apply professional-grade coating.' },
      { title: 'Curing & Inspection', description: 'Allow proper curing time and final inspection.' },
    ],
    galleryImages: [
      { image: '/images/bathroom1.jpg', alt: 'Tile reglazing' },
      { image: '/images/bathroom3.jpg', alt: 'Reglazing project' },
      { image: '/images/bathroom-service1.jpg', alt: 'Reglazing work' },
    ],
    metaTitle: 'Tile Reglazing | Aguirre Modern Tile',
    metaDescription: 'Professional tile and bathtub reglazing in Greater Boston. Refresh your existing tile with a new finish.',
  },
}

const validSlugs = Object.keys(defaultServices)

async function getService(slug: string): Promise<ServiceData | null> {
  const defaults = defaultServices[slug]
  if (!defaults) return null

  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'services',
      where: { slug: { equals: slug } },
      limit: 1,
    })

    if (result.docs.length > 0) {
      const s: any = result.docs[0]
      return {
        title: s.title || defaults.title,
        slug: s.slug || defaults.slug,
        description: s.description || defaults.description,
        heroDescription: s.heroDescription || defaults.heroDescription,
        priceRange: s.priceRange || defaults.priceRange,
        image: s.image || defaults.image,
        features: s.features?.length > 0 ? s.features.map((f: any) => f.feature) : defaults.features,
        processSteps: s.processSteps?.length > 0 ? s.processSteps.map((p: any) => ({ title: p.title, description: p.description })) : defaults.processSteps,
        galleryImages: s.galleryImages?.length > 0 ? s.galleryImages.map((g: any) => ({ image: g.image, alt: g.alt || '' })) : defaults.galleryImages,
        metaTitle: s.metaTitle || defaults.metaTitle,
        metaDescription: s.metaDescription || defaults.metaDescription,
      }
    }
  } catch {
    // Payload not initialized yet
  }

  return defaults
}

export async function generateStaticParams() {
  try {
    const payload = await getPayloadClient()
    const result = await payload.find({ collection: 'services', limit: 50 })
    if (result.docs.length > 0) {
      return result.docs.map((s: any) => ({ slug: s.slug }))
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
  const service = await getService(slug)
  if (!service) return {}
  return {
    title: service.metaTitle,
    description: service.metaDescription,
  }
}

export default async function ServiceDetailPage({ params }: Props) {
  const { slug } = await params
  const service = await getService(slug)

  if (!service) {
    notFound()
  }

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 to-primary-900 text-white section-padding">
        <div className="container-custom">
          <div className="max-w-3xl">
            <Link href="/services" className="text-primary-300 hover:text-primary-200 mb-4 inline-block">
              &larr; Back to Services
            </Link>
            <h1 className="heading-primary text-white mb-6">{service.title}</h1>
            <p className="text-xl text-gray-300 mb-6">
              {service.heroDescription}
            </p>
            <div className="flex items-center gap-4">
              <span className="text-2xl font-bold">{service.priceRange}</span>
              <span className="text-gray-400">depending on scope</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section-padding">
        <div className="container-custom">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="heading-secondary mb-6">
                {slug === 'tile-repair' ? "What We Fix" : "What's Included"}
              </h2>
              <p className="text-body mb-6">{service.description}</p>

              <ul className="grid grid-cols-2 gap-3">
                {service.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-gray-700">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <a href="/contact" className="btn-primary inline-flex items-center gap-2 mt-8">
                Get a Quote <ArrowRight className="w-4 h-4" />
              </a>
            </div>

            <div className="relative rounded-2xl aspect-square overflow-hidden">
              <Image
                src={service.image}
                alt={service.title}
                fill
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Process Steps (if available) */}
      {service.processSteps.length > 0 && (
        <section className="section-padding bg-gray-50">
          <div className="container-custom">
            <div className="text-center mb-12">
              <h2 className="heading-secondary mb-4">Our Process</h2>
              <p className="text-body max-w-2xl mx-auto">
                Here&apos;s what to expect when you work with us.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {service.processSteps.map((item, index) => (
                <div key={item.title} className="bg-white rounded-xl p-6 shadow-sm">
                  <div className="w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold mb-4">
                    {index + 1}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-gray-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Waterproofing Section (bathroom-tile only) */}
      {slug === 'bathroom-tile' && (
        <section className="section-padding">
          <div className="container-custom">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="heading-secondary mb-6">Why Waterproofing Matters</h2>
              <p className="text-body mb-8">
                The tile you see is only part of the story. Behind every shower, there&apos;s a
                waterproofing system that protects your home from moisture damage.
              </p>

              <div className="grid md:grid-cols-2 gap-6 text-left">
                <div className="bg-red-50 rounded-xl p-6 border border-red-200">
                  <h3 className="font-bold text-red-800 mb-2">Without Proper Waterproofing</h3>
                  <ul className="space-y-2 text-red-700">
                    <li>&bull; Water seeps behind tile</li>
                    <li>&bull; Mold growth in walls</li>
                    <li>&bull; Rotting wood framing</li>
                    <li>&bull; Expensive repairs in 3-5 years</li>
                  </ul>
                </div>

                <div className="bg-green-50 rounded-xl p-6 border border-green-200">
                  <h3 className="font-bold text-green-800 mb-2">With Our Systems</h3>
                  <ul className="space-y-2 text-green-700">
                    <li>&bull; KERDI-BOARD/GO-BOARD envelope</li>
                    <li>&bull; Zero moisture penetration</li>
                    <li>&bull; Manufacturer warranty</li>
                    <li>&bull; 20+ years of protection</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Gallery */}
      {service.galleryImages.length > 0 && (
        <section className={`section-padding ${slug === 'bathroom-tile' ? '' : 'bg-gray-50'}`}>
          <div className="container-custom">
            <h2 className="heading-secondary text-center mb-8">Our Work</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {service.galleryImages.map((img, index) => (
                <div key={index} className="relative aspect-[4/3] rounded-xl overflow-hidden">
                  <Image src={img.image} alt={img.alt || `${service.title} project ${index + 1}`} fill className="object-cover" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

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
