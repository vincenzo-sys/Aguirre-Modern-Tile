import Link from 'next/link'
import {
  Phone,
  Star,
  Shield,
  CheckCircle,
  Award,
  Wrench,
  Droplets,
  Grid3X3,
  Home,
  Hammer,
  Sparkles,
  ArrowRight,
  MapPin,
} from 'lucide-react'
import LeadCaptureForm from '@/components/LeadCaptureForm'
import { getCmsGlobal, getCmsCollection } from '@/lib/cms'

const iconMap: Record<string, React.ReactNode> = {
  Home: <Home className="w-8 h-8" />,
  Droplets: <Droplets className="w-8 h-8" />,
  Grid3X3: <Grid3X3 className="w-8 h-8" />,
  Wrench: <Wrench className="w-8 h-8" />,
  Hammer: <Hammer className="w-8 h-8" />,
  Sparkles: <Sparkles className="w-8 h-8" />,
}

const defaultServices = [
  { icon: 'Home', title: 'Bathroom Tile Installation', description: 'Complete bathroom transformations with expert waterproofing and precision tile work.', slug: 'bathroom-tile' },
  { icon: 'Droplets', title: 'Shower Tile Installation', description: 'Waterproof shower systems built to last. KERDI-BOARD and GO-BOARD specialists.', slug: 'shower-tile' },
  { icon: 'Grid3X3', title: 'Floor Tile Installation', description: 'Durable, beautiful floors. Large format tile, patterns, and heated floor compatible.', slug: 'floor-tile' },
  { icon: 'Wrench', title: 'Backsplash Installation', description: 'Kitchen and bathroom backsplashes that transform your space.', slug: 'backsplash-tile' },
  { icon: 'Hammer', title: 'Tile Repair', description: 'Fix cracked, loose, or damaged tiles. Grout repair and resealing.', slug: 'tile-repair' },
  { icon: 'Sparkles', title: 'Tile Reglazing', description: 'Refresh your existing tile with professional reglazing services.', slug: 'tile-reglazing' },
]

const defaultTestimonials = [
  { name: 'Sarah M.', location: 'Cambridge, MA', rating: 5, text: 'Christian and his team did an amazing job on our master bathroom. The attention to detail and communication throughout the project was exceptional.' },
  { name: 'Mike P.', location: 'Boston, MA', rating: 5, text: 'From the virtual estimate to the final walkthrough, everything was professional. They showed up on time every day and left the workspace clean.' },
  { name: 'Jennifer L.', location: 'Somerville, MA', rating: 5, text: "Best contractor experience we've ever had. Fair pricing, beautiful work, and they actually answer the phone! Highly recommend." },
]

const defaultServiceAreas = ['Revere', 'Boston', 'Cambridge', 'Somerville', 'Everett', 'Chelsea', 'Malden', 'Medford', 'Melrose', 'Lynn', 'Saugus', 'Winthrop', 'Brookline', 'Arlington', 'Belmont', 'Watertown', 'Stoneham', 'Wakefield']

export default async function HomePage() {
  let services = defaultServices
  let testimonials = defaultTestimonials
  let serviceAreas = defaultServiceAreas
  let hero = {
    title: 'Expert Tile Installation in Greater Boston',
    subtitle: 'Transforming homes with precision craftsmanship for 15+ years. We answer in 5 minutes and deliver same-day virtual estimates.',
  }
  let rating = '4.9'
  let reviewCount = '150+'
  let phone = '(617) 766-1259'
  let whyChooseUs = [
    { title: 'Quality Craftsmanship', description: 'Proper waterproofing, full thinset coverage, level surfaces, and clean cuts on every job.' },
    { title: 'Fast Response', description: 'We answer calls and messages within 5 minutes. Same-day estimates available.' },
    { title: '150+ 5-Star Reviews', description: 'Our customers love our work. Check out our Google reviews to see why.' },
  ]

  try {
    const [svcData, testimonialData, homepageData, companyInfo] = await Promise.all([
      getCmsCollection<any>('services', { sort: 'sortOrder', limit: '20' }),
      getCmsCollection<any>('testimonials', { 'where[featured][equals]': 'true', limit: '10' }),
      getCmsGlobal<any>('homepage'),
      getCmsGlobal<any>('company-info'),
    ])

    if (svcData && svcData.docs.length > 0) {
      services = svcData.docs.map((s: any) => ({
        icon: s.icon || 'Home',
        title: s.title,
        description: s.description,
        slug: s.slug,
      }))
    }

    if (testimonialData && testimonialData.docs.length > 0) {
      testimonials = testimonialData.docs.map((t: any) => ({
        name: t.name,
        location: t.location,
        rating: t.rating,
        text: t.text,
      }))
    }

    if (homepageData) {
      if (homepageData.hero) {
        hero = {
          title: homepageData.hero.title || hero.title,
          subtitle: homepageData.hero.subtitle || hero.subtitle,
        }
      }
      if (homepageData.serviceAreas && (homepageData.serviceAreas as any[]).length > 0) {
        serviceAreas = (homepageData.serviceAreas as any[]).map((a) => a.city)
      }
      if (homepageData.whyChooseUs && (homepageData.whyChooseUs as any[]).length > 0) {
        whyChooseUs = homepageData.whyChooseUs as any[]
      }
    }

    if (companyInfo) {
      rating = companyInfo.stats?.googleRating || rating
      reviewCount = companyInfo.stats?.reviewCount || reviewCount
      phone = companyInfo.phone || phone
    }
  } catch {
    // CMS not available — use defaults
  }

  const phoneDigits = phone.replace(/\D/g, '')

  return (
    <>
      {/* Hero Section */}
      <section id="top" className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-primary-900 text-white overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%23ffffff" fill-opacity="0.4"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
          }} />
        </div>

        <div className="container-custom section-padding relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              {/* Reviews Badge */}
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 mb-6">
                <Star className="w-5 h-5 text-yellow-400 fill-current" />
                <span className="font-semibold">{rating}</span>
                <span className="text-gray-300">•</span>
                <span className="text-gray-300">{reviewCount} Google Reviews</span>
              </div>

              <h1 className="heading-primary text-white mb-6">
                {hero.title}
              </h1>
              <p className="text-xl text-gray-300 mb-8">
                {hero.subtitle}
              </p>

              {/* Response Time Indicator */}
              <div className="flex items-center gap-3 mb-8">
                <div className="flex items-center gap-2 bg-green-500/20 text-green-400 px-4 py-2 rounded-full">
                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="font-medium">We Answer in 5 Minutes</span>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <a href="/contact" className="btn-cta">
                  Get Your Free Estimate
                </a>
                <a
                  href={`tel:${phoneDigits}`}
                  className="btn-outline-white flex items-center justify-center gap-2"
                >
                  <Phone className="w-5 h-5" />
                  Call Now: {phone}
                </a>
              </div>
            </div>

            {/* Lead Capture Form */}
            <div className="lg:pl-8">
              <LeadCaptureForm />
            </div>
          </div>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="bg-primary-600 text-white py-6">
        <div className="container-custom px-4">
          <div className="flex flex-wrap justify-center gap-8 md:gap-16">
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6" />
              <span className="font-medium">Licensed</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6" />
              <span className="font-medium">Insured</span>
            </div>
            <div className="flex items-center gap-2">
              <Award className="w-6 h-6" />
              <span className="font-medium">15+ Years Experience</span>
            </div>
            <div className="flex items-center gap-2">
              <Home className="w-6 h-6" />
              <span className="font-medium">220+ Bathrooms/Year</span>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="section-padding bg-gray-50">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="heading-secondary mb-4">Our Services</h2>
            <p className="text-body max-w-2xl mx-auto">
              From complete bathroom renovations to simple repairs, we handle all
              your tile needs with expert craftsmanship.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service) => (
              <Link
                key={service.title}
                href={`/services/${service.slug}`}
                className="bg-white rounded-xl p-6 shadow-sm hover:shadow-lg transition-shadow group"
              >
                <div className="w-14 h-14 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600 mb-4 group-hover:bg-primary-600 group-hover:text-white transition-colors">
                  {iconMap[service.icon] || <Home className="w-8 h-8" />}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {service.title}
                </h3>
                <p className="text-gray-600 mb-4">{service.description}</p>
                <span className="text-primary-600 font-medium flex items-center gap-2 group-hover:gap-3 transition-all">
                  Learn More <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="section-padding bg-primary-50">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="heading-secondary mb-4">Why Choose Aguirre Modern Tile?</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {whyChooseUs.map((item, index) => (
              <div key={index} className="bg-white rounded-xl p-6 shadow-sm text-center">
                <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  {index === 0 && <CheckCircle className="w-6 h-6 text-primary-600" />}
                  {index === 1 && <Phone className="w-6 h-6 text-primary-600" />}
                  {index === 2 && <Star className="w-6 h-6 text-primary-600" />}
                </div>
                <h4 className="font-bold text-gray-900 mb-2">{item.title}</h4>
                <p className="text-gray-600 text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="section-padding">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="heading-secondary mb-4">What Our Customers Say</h2>
            <div className="flex items-center justify-center gap-2 text-lg">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-6 h-6 text-yellow-400 fill-current" />
                ))}
              </div>
              <span className="font-semibold">{rating}</span>
              <span className="text-gray-500">from {reviewCount} reviews</span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="bg-white rounded-xl p-6 shadow-sm border border-gray-100"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                  ))}
                </div>
                <p className="text-gray-700 mb-4">&ldquo;{testimonial.text}&rdquo;</p>
                <div>
                  <p className="font-semibold text-gray-900">{testimonial.name}</p>
                  <p className="text-sm text-gray-500">{testimonial.location}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-8">
            <a
              href="https://www.google.com/maps/place/Aguirre+Modern+Tile"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 font-medium hover:text-primary-700"
            >
              Read all reviews on Google →
            </a>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="section-padding bg-primary-600 text-white">
        <div className="container-custom text-center">
          <h2 className="heading-secondary text-white mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-primary-100 mb-8 max-w-2xl mx-auto">
            Get a free estimate for your tile project. We respond within 5 minutes.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="#top" className="btn-cta bg-white text-primary-600 hover:bg-gray-100">
              Get Your Free Estimate
            </a>
            <a
              href={`tel:${phoneDigits}`}
              className="btn-outline-white flex items-center justify-center gap-2"
            >
              <Phone className="w-5 h-5" />
              Call {phone}
            </a>
          </div>
        </div>
      </section>

      {/* Service Area */}
      <section className="section-padding">
        <div className="container-custom">
          <div className="text-center mb-8">
            <h2 className="heading-secondary mb-4">Serving Greater Boston</h2>
            <p className="text-body">
              We proudly serve homeowners throughout the Greater Boston area.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3 max-w-4xl mx-auto">
            {serviceAreas.map((area) => (
              <span
                key={area}
                className="flex items-center gap-1 bg-gray-100 px-4 py-2 rounded-full text-gray-700"
              >
                <MapPin className="w-4 h-4 text-primary-500" />
                {area}
              </span>
            ))}
          </div>

          <div className="text-center mt-8">
            <p className="text-gray-500">
              Don&apos;t see your town? <a href="/contact" className="text-primary-600 font-medium">Contact us</a> — we may still be able to help!
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
