import Image from 'next/image'
import Link from 'next/link'
import { Phone, Star, CheckCircle, MapPin, Clock, Shield, Award, Wrench } from 'lucide-react'

interface LocationPageProps {
  city: string
  neighborhood?: string
  state?: string
  serviceType?: string
  serviceTitle?: string
}

// Service-specific content configurations
const serviceContent: Record<string, {
  heroDescription: string
  heroImage: string
  gallery: string[]
  benefits: { title: string; description: string }[]
  faqs: { question: string; answer: string }[]
  serviceLink: string
}> = {
  tilecontractor: {
    heroDescription: 'Full-service tile contractor for residential and commercial projects. From bathroom remodels to custom showers, floor installations, and kitchen backsplashes.',
    heroImage: '/images/bathroom-service1.jpg',
    gallery: ['/images/bathroom-service1.jpg', '/images/shower1.jpg', '/images/floor1.jpg', '/images/backsplash1.jpg'],
    benefits: [
      { title: 'Full-Service Tile Work', description: 'Bathroom, shower, floor, backsplash, repair, and reglazing services.' },
      { title: 'Quality Materials', description: 'We work with ceramic, porcelain, natural stone, glass, and mosaic tiles.' },
      { title: 'Expert Craftsmanship', description: 'Precision cuts, level installations, and waterproof finishes.' },
    ],
    faqs: [
      { question: 'What areas do you serve?', answer: 'We serve the Greater Boston area including all neighborhoods and surrounding communities within 30 miles.' },
      { question: 'Do you provide free estimates?', answer: 'Yes, we provide free in-home estimates for all tile projects. We will assess your space and provide a detailed quote.' },
      { question: 'Are you licensed and insured?', answer: 'Yes, Aguirre Modern Tile is fully licensed and insured for all tile installation and repair work in Massachusetts.' },
    ],
    serviceLink: '/services',
  },
  bathroomtileinstallation: {
    heroDescription: 'Transform your bathroom with professional tile installation. We handle floors, walls, shower surrounds, tub decks, and custom tile features.',
    heroImage: '/images/bathroom-service1.jpg',
    gallery: ['/images/bathroom-service1.jpg', '/images/bathroom-service2.jpg', '/images/bathroom-service3.jpg', '/images/bathroom-service4.jpg'],
    benefits: [
      { title: 'Complete Bathroom Tiling', description: 'Floors, walls, shower areas, tub surrounds, and accent features.' },
      { title: 'Waterproof Installation', description: 'Proper waterproofing and moisture barriers for long-lasting results.' },
      { title: 'Design Assistance', description: 'Help choosing tile patterns, colors, and layouts for your space.' },
    ],
    faqs: [
      { question: 'How long does bathroom tile installation take?', answer: 'Most bathroom tile projects take 3-5 days depending on the size and complexity. This includes surface prep, tile installation, and grouting.' },
      { question: 'Can you tile over existing tile?', answer: 'In some cases yes, but we typically recommend removing old tile to ensure proper adhesion and a level surface.' },
      { question: 'What tile is best for bathroom floors?', answer: 'Porcelain tile is ideal for bathroom floors due to its water resistance and durability. We also install ceramic and natural stone options.' },
    ],
    serviceLink: '/services/bathroom-tile',
  },
  showertileinstallation: {
    heroDescription: 'Custom shower tile installation with proper waterproofing. Walk-in showers, shower pans, bench seating, niches, and decorative accents.',
    heroImage: '/images/shower1.jpg',
    gallery: ['/images/shower1.jpg', '/images/bathroom-service1.jpg', '/images/bathroom-service3.jpg', '/images/bathroom-service5.jpg'],
    benefits: [
      { title: 'Waterproof Systems', description: 'Kerdi, RedGard, and other proven waterproofing membranes.' },
      { title: 'Custom Features', description: 'Built-in niches, corner shelves, bench seats, and accent strips.' },
      { title: 'Proper Drainage', description: 'Correctly sloped shower pans for complete water drainage.' },
    ],
    faqs: [
      { question: 'How do you waterproof a shower?', answer: 'We use industry-leading waterproofing systems like Schluter Kerdi or liquid membranes like RedGard to create a watertight barrier behind your tile.' },
      { question: 'Can you install a curbless shower?', answer: 'Yes, we specialize in curbless (zero-entry) showers with linear drains for a modern, accessible design.' },
      { question: 'What tile works best in showers?', answer: 'Porcelain and ceramic tiles with low water absorption are ideal. We recommend smaller tiles or mosaics for shower floors for better traction.' },
    ],
    serviceLink: '/services/shower-tile',
  },
  floortileinstallation: {
    heroDescription: 'Professional floor tile installation for kitchens, bathrooms, entryways, and living spaces. Large format, wood-look, and decorative patterns.',
    heroImage: '/images/floor1.jpg',
    gallery: ['/images/floor1.jpg', '/images/floor2.jpg', '/images/floor3.jpg', '/images/floor4.jpg'],
    benefits: [
      { title: 'Large Format Tile', description: 'Expert installation of 24x24, 12x24, and oversized floor tiles.' },
      { title: 'Pattern Layouts', description: 'Herringbone, chevron, brick, and custom geometric patterns.' },
      { title: 'Subfloor Prep', description: 'Leveling, crack isolation, and underlayment for perfect results.' },
    ],
    faqs: [
      { question: 'Do you level floors before tiling?', answer: 'Yes, proper floor leveling is essential. We use self-leveling compounds to create a flat, even surface before tile installation.' },
      { question: 'Can you install heated floors under tile?', answer: 'Yes, we install electric radiant floor heating systems under tile. This works great in bathrooms and kitchens.' },
      { question: 'What is the best tile for high-traffic areas?', answer: 'Porcelain tile with a PEI rating of 4 or 5 is best for high-traffic areas like entryways and kitchens due to its durability.' },
    ],
    serviceLink: '/services/floor-tile',
  },
  backsplashtileinstallation: {
    heroDescription: 'Kitchen and bathroom backsplash installation. Subway tile, mosaic, glass, natural stone, and custom patterns to complement your space.',
    heroImage: '/images/backsplash1.jpg',
    gallery: ['/images/backsplash1.jpg', '/images/backsplash2.jpg', '/images/backsplash3.jpg', '/images/backsplash4.jpg'],
    benefits: [
      { title: 'Precise Cuts', description: 'Clean cuts around outlets, switches, and fixtures.' },
      { title: 'Pattern Expertise', description: 'Subway, herringbone, arabesque, and mosaic installations.' },
      { title: 'Material Options', description: 'Ceramic, porcelain, glass, natural stone, and metal tiles.' },
    ],
    faqs: [
      { question: 'How far up should a backsplash go?', answer: 'Standard backsplashes go from countertop to the bottom of upper cabinets (about 18 inches). Full-height backsplashes extend to the ceiling.' },
      { question: 'Do you remove old backsplash?', answer: 'Yes, we handle removal of existing backsplash, drywall repair if needed, and installation of new tile.' },
      { question: 'What grout color should I use?', answer: 'Matching grout creates a seamless look, while contrasting grout highlights the tile pattern. We help you choose based on your design goals.' },
    ],
    serviceLink: '/services/backsplash-tile',
  },
  tilerepair: {
    heroDescription: 'Fix cracked, chipped, loose, or damaged tiles. Grout repair, regrouting, caulk replacement, and tile matching for seamless repairs.',
    heroImage: '/images/repair1.jpg',
    gallery: ['/images/repair1.jpg', '/images/repair2.jpg', '/images/repair3.jpg', '/images/bathroom-service1.jpg'],
    benefits: [
      { title: 'Tile Matching', description: 'We source matching tiles or find the closest alternatives.' },
      { title: 'Grout Restoration', description: 'Remove old grout, regrout, and seal for a fresh look.' },
      { title: 'Leak Prevention', description: 'Repair damaged areas before water causes further damage.' },
    ],
    faqs: [
      { question: 'Can you replace just one tile?', answer: 'Yes, we can replace individual cracked or damaged tiles. We carefully remove the damaged tile and install a replacement.' },
      { question: 'How do you fix loose tiles?', answer: 'We remove loose tiles, clean the substrate, apply fresh thinset, and reset the tiles. Then we regrout to complete the repair.' },
      { question: 'Can cracked grout cause leaks?', answer: 'Yes, cracked or missing grout in showers and wet areas can allow water behind tiles, causing mold and structural damage. Regrouting prevents this.' },
    ],
    serviceLink: '/services/tile-repair',
  },
  tilereglazing: {
    heroDescription: 'Refinish and restore your existing tile, bathtub, and fixtures. A cost-effective alternative to full replacement with a fresh, new appearance.',
    heroImage: '/images/bathroom1.jpg',
    gallery: ['/images/bathroom1.jpg', '/images/reglaze1.jpg', '/images/reglaze2.jpg', '/images/reglaze3.jpg'],
    benefits: [
      { title: 'Cost Savings', description: 'Reglazing costs 70-80% less than full tile replacement.' },
      { title: 'Quick Turnaround', description: 'Most reglazing projects completed in 1-2 days.' },
      { title: 'Color Options', description: 'Choose from white, almond, and custom colors.' },
    ],
    faqs: [
      { question: 'How long does reglazing last?', answer: 'Professional reglazing typically lasts 10-15 years with proper care. Avoid abrasive cleaners and use non-slip mats.' },
      { question: 'Can you change the color of tile?', answer: 'Yes, reglazing allows you to change your tile color. Most customers choose white for a clean, updated look.' },
      { question: 'How soon can I use the tub after reglazing?', answer: 'The coating needs 24-48 hours to fully cure. After that, your refinished surface is ready for normal use.' },
    ],
    serviceLink: '/services/tile-reglazing',
  },
}

const allServices = [
  { name: 'Bathroom Tile Installation', link: '/services/bathroom-tile' },
  { name: 'Shower Tile Installation', link: '/services/shower-tile' },
  { name: 'Floor Tile Installation', link: '/services/floor-tile' },
  { name: 'Backsplash Installation', link: '/services/backsplash-tile' },
  { name: 'Tile Repair', link: '/services/tile-repair' },
  { name: 'Tile Reglazing', link: '/services/tile-reglazing' },
]

export default function LocationPage({ city, neighborhood, state = 'MA', serviceType = 'tilecontractor', serviceTitle = 'Tile Contractor' }: LocationPageProps) {
  const locationName = neighborhood ? `${neighborhood}, ${city}` : city
  const content = serviceContent[serviceType] || serviceContent.tilecontractor

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 to-primary-900 text-white section-padding">
        <div className="container-custom">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-5 h-5 text-primary-400" />
                <span className="text-primary-300">Serving {locationName}, {state}</span>
              </div>
              <h1 className="heading-primary text-white mb-6">
                {serviceTitle} in {locationName}, {state}
              </h1>
              <p className="text-xl text-gray-300 mb-6">
                {content.heroDescription}
              </p>

              <div className="flex items-center gap-4 mb-8">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                  ))}
                </div>
                <span className="text-gray-300">5.0 rating on Google</span>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/" className="btn-cta">
                  Get a Free Estimate
                </Link>
                <a href="tel:6177661259" className="btn-outline-white flex items-center justify-center gap-2">
                  <Phone className="w-5 h-5" />
                  (617) 766-1259
                </a>
              </div>
            </div>

            <div className="relative rounded-2xl overflow-hidden aspect-[4/3]">
              <Image
                src={content.heroImage}
                alt={`${serviceTitle} in ${locationName}`}
                fill
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Service-Specific Benefits */}
      <section className="section-padding">
        <div className="container-custom">
          <h2 className="heading-secondary text-center mb-4">
            {serviceTitle} Services in {locationName}
          </h2>
          <p className="text-body text-center max-w-2xl mx-auto mb-12">
            Professional {serviceTitle.toLowerCase()} for homeowners in {locationName} and the Greater Boston area.
          </p>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {content.benefits.map((benefit, index) => (
              <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
                  {index === 0 && <Wrench className="w-6 h-6 text-primary-600" />}
                  {index === 1 && <Shield className="w-6 h-6 text-primary-600" />}
                  {index === 2 && <Award className="w-6 h-6 text-primary-600" />}
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{benefit.title}</h3>
                <p className="text-gray-600">{benefit.description}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link href={content.serviceLink} className="btn-primary">
              Learn More About This Service
            </Link>
          </div>
        </div>
      </section>

      {/* All Services */}
      <section className="section-padding bg-gray-50">
        <div className="container-custom">
          <h2 className="heading-secondary text-center mb-4">
            All Tile Services in {locationName}
          </h2>
          <p className="text-body text-center max-w-2xl mx-auto mb-12">
            In addition to {serviceTitle.toLowerCase()}, we offer a complete range of tile services.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {allServices.map((service) => (
              <Link
                key={service.name}
                href={service.link}
                className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md hover:border-primary-200 transition-all"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
                  <span className="font-semibold text-gray-900">{service.name}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section className="section-padding">
        <div className="container-custom">
          <h2 className="heading-secondary text-center mb-8">
            Recent {serviceTitle} Projects
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {content.gallery.map((image, index) => (
              <div key={index} className="relative aspect-square rounded-xl overflow-hidden group">
                <Image
                  src={image}
                  alt={`${serviceTitle} project ${index + 1}`}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/gallery" className="btn-secondary">
              View Full Gallery
            </Link>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="section-padding bg-gray-50">
        <div className="container-custom">
          <h2 className="heading-secondary text-center mb-12">
            Why {locationName} Homeowners Choose Aguirre Modern Tile
          </h2>
          <div className="grid md:grid-cols-4 gap-8 max-w-5xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Star className="w-8 h-8 text-primary-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">5-Star Rated</h3>
              <p className="text-gray-600 text-sm">Consistently rated 5 stars by our customers on Google.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-primary-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Licensed & Insured</h3>
              <p className="text-gray-600 text-sm">Fully licensed and insured in Massachusetts.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-primary-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Fast Response</h3>
              <p className="text-gray-600 text-sm">We respond to inquiries quickly and provide same-day estimates.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Award className="w-8 h-8 text-primary-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Quality Guaranteed</h3>
              <p className="text-gray-600 text-sm">We stand behind our work with a satisfaction guarantee.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="section-padding">
        <div className="container-custom max-w-3xl">
          <h2 className="heading-secondary text-center mb-12">
            {serviceTitle} FAQs for {locationName}
          </h2>
          <div className="space-y-6">
            {content.faqs.map((faq, index) => (
              <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-900 mb-3">{faq.question}</h3>
                <p className="text-gray-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding bg-primary-600 text-white">
        <div className="container-custom text-center">
          <h2 className="heading-secondary text-white mb-4">
            Ready for Your {serviceTitle} Project in {locationName}?
          </h2>
          <p className="text-xl text-primary-100 mb-8 max-w-2xl mx-auto">
            Get a free estimate today. We serve {locationName} and all surrounding communities.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/" className="btn-cta bg-white text-primary-600 hover:bg-gray-100">
              Get Your Free Estimate
            </Link>
            <a href="tel:6177661259" className="btn-outline-white flex items-center justify-center gap-2">
              <Phone className="w-5 h-5" />
              Call (617) 766-1259
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
