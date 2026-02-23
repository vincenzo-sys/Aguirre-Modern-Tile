import Link from 'next/link'
import Image from 'next/image'
import { Metadata } from 'next'
import { Home, Droplets, Grid3X3, Wrench, Hammer, Sparkles, ArrowRight, CheckCircle } from 'lucide-react'
import { getPayloadClient } from '@/lib/payload'

export const metadata: Metadata = {
  title: 'Our Services | Aguirre Modern Tile',
  description: 'Professional tile installation services in Greater Boston. Bathroom tile, shower tile, floor tile, backsplash, tile repair, and reglazing.',
}

const iconMap: Record<string, React.ReactNode> = {
  Home: <Home className="w-10 h-10" />,
  Droplets: <Droplets className="w-10 h-10" />,
  Grid3X3: <Grid3X3 className="w-10 h-10" />,
  Wrench: <Wrench className="w-10 h-10" />,
  Hammer: <Hammer className="w-10 h-10" />,
  Sparkles: <Sparkles className="w-10 h-10" />,
}

const defaultServices = [
  { icon: 'Home', title: 'Bathroom Tile Installation', description: 'Complete bathroom transformations with expert waterproofing and precision tile work. From floors to walls, we handle it all.', features: ['Full bathroom remodels', 'Custom shower niches', 'Heated floor compatible', 'Waterproof systems'], priceRange: '$4,500 - $15,000+', slug: 'bathroom-tile', image: '/images/bathroom-service1.jpg' },
  { icon: 'Droplets', title: 'Shower Tile Installation', description: 'Waterproof shower systems built to last. We specialize in KERDI-BOARD and GO-BOARD installations for leak-free showers.', features: ['KERDI-BOARD systems', 'Linear drain installation', 'Custom bench seating', 'Glass tile work'], priceRange: '$2,500 - $8,000+', slug: 'shower-tile', image: '/images/shower1.jpg' },
  { icon: 'Grid3X3', title: 'Floor Tile Installation', description: 'Beautiful, durable tile floors for any room. We work with all tile sizes and materials, including large format tiles.', features: ['Large format tiles', 'Pattern installations', 'Heated floor systems', 'Level substrate prep'], priceRange: '$1,500 - $6,000+', slug: 'floor-tile', image: '/images/floor1.jpg' },
  { icon: 'Wrench', title: 'Backsplash Installation', description: 'Transform your kitchen or bathroom with a stunning backsplash. From subway tile to intricate mosaics.', features: ['Kitchen backsplashes', 'Bathroom backsplashes', 'Custom patterns', 'Behind-stove installations'], priceRange: '$800 - $3,000+', slug: 'backsplash-tile', image: '/images/backsplash1.jpg' },
  { icon: 'Hammer', title: 'Tile Repair', description: 'Fix cracked, loose, or damaged tiles without replacing the entire installation. Expert matching and repairs.', features: ['Cracked tile replacement', 'Loose tile repair', 'Grout repair', 'Color matching'], priceRange: '$200 - $1,500+', slug: 'tile-repair', image: '/images/repair1.jpg' },
  { icon: 'Sparkles', title: 'Tile Reglazing', description: 'Refresh your existing tile with professional reglazing. A cost-effective way to update your space.', features: ['Color change options', 'Bathtub reglazing', 'Sink reglazing', 'Tile resurfacing'], priceRange: '$500 - $2,000+', slug: 'tile-reglazing', image: '/images/bathroom1.jpg' },
]

export default async function ServicesPage() {
  let services = defaultServices

  try {
    const payload = await getPayloadClient()
    const svcData = await payload.find({ collection: 'services', sort: 'sortOrder', limit: 20 })

    if (svcData.docs.length > 0) {
      services = svcData.docs.map((s: any) => ({
        icon: s.icon || 'Home',
        title: s.title,
        description: s.description,
        features: s.features?.slice(0, 4).map((f: any) => f.feature) || [],
        priceRange: s.priceRange || '',
        slug: s.slug,
        image: s.image || '/images/bathroom-service1.jpg',
      }))
    }
  } catch {
    // Payload not initialized yet — use defaults
  }

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 to-primary-900 text-white section-padding">
        <div className="container-custom">
          <div className="max-w-3xl">
            <h1 className="heading-primary text-white mb-6">Our Services</h1>
            <p className="text-xl text-gray-300">
              From complete bathroom renovations to simple repairs, we handle all your
              tile needs with expert craftsmanship and proper techniques.
            </p>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="section-padding">
        <div className="container-custom">
          <div className="grid gap-8">
            {services.map((service, index) => (
              <div
                key={service.title}
                className={`grid md:grid-cols-2 gap-8 items-center ${
                  index % 2 === 1 ? 'md:flex-row-reverse' : ''
                }`}
              >
                <div className={index % 2 === 1 ? 'md:order-2' : ''}>
                  <div className="w-16 h-16 bg-primary-100 rounded-xl flex items-center justify-center text-primary-600 mb-6">
                    {iconMap[service.icon] || <Home className="w-10 h-10" />}
                  </div>
                  <h2 className="heading-secondary mb-4">{service.title}</h2>
                  <p className="text-body mb-6">{service.description}</p>

                  <ul className="grid grid-cols-2 gap-3 mb-6">
                    {service.features.map((feature: string) => (
                      <li key={feature} className="flex items-center gap-2 text-gray-600">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-center gap-6">
                    <div>
                      <span className="text-sm text-gray-500">Starting at</span>
                      <p className="text-xl font-bold text-primary-600">{service.priceRange}</p>
                    </div>
                    <Link
                      href={`/services/${service.slug}`}
                      className="btn-primary flex items-center gap-2"
                    >
                      Learn More <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>

                <div className={`relative rounded-2xl aspect-video overflow-hidden ${index % 2 === 1 ? 'md:order-1' : ''}`}>
                  <Image
                    src={service.image}
                    alt={service.title}
                    fill
                    className="object-cover"
                  />
                </div>
              </div>
            ))}
          </div>
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
