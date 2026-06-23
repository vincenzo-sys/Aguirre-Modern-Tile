import Link from 'next/link'
import {
  Phone,
  Star,
  Shield,
  CheckCircle,
  Check,
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
import type { Metadata } from 'next'
import LeadCaptureForm from '@/components/LeadCaptureForm'
import QuoteCalculator from '@/components/QuoteCalculator'
import JsonLd, { localBusinessJsonLd } from '@/components/JsonLd'
import { getCmsGlobal, getCmsCollection } from '@/lib/cms'

// Explicit homepage metadata (overrides the root-layout default) so the title,
// description, canonical, and social card are tuned for the brand's primary
// landing page rather than inheriting a generic fallback.
export const metadata: Metadata = {
  title: 'Aguirre Modern Tile | Expert Tile Installation in Greater Boston',
  description:
    'Greater Boston tile installation experts. Bathroom, shower, floor & backsplash tile. 150+ five-star reviews, licensed & insured, free same-day estimates. Call (617) 766-1259.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Aguirre Modern Tile | Expert Tile Installation in Greater Boston',
    description:
      'Bathroom, shower, floor & backsplash tile installation across Greater Boston. 150+ five-star reviews, licensed & insured, free same-day estimates.',
    url: 'https://www.aguirremoderntile.com',
    siteName: 'Aguirre Modern Tile',
    type: 'website',
    locale: 'en_US',
  },
}

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
      <JsonLd data={localBusinessJsonLd()} />

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

      {/* Honest Project Planner — replaces the old fake-precise dollar
          calculator. Educates the visitor about labor days, what's actually
          in scope at our pricing tier, and what we'd need to know to give a
          real number. The three lead magnets are: (1) send photos for a
          written estimate, (2) text Vince a tile for a quick spec review. */}
      <section className="py-12 sm:py-16 bg-gray-50">
        <div className="container-custom px-4">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-6 sm:mb-8">
              <h2 className="heading-secondary mb-2">How much should your project cost?</h2>
              <p className="text-gray-600">
                We won&apos;t quote you a fake number from a webpage. Here&apos;s how we actually price tile work — and what your project looks like at our shop.
              </p>
            </div>
            <QuoteCalculator />
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

      {/* Pricing-tier explainer. Sets the frame: tile pricing is labor days
          × crew rate, plus materials. Homeowners who get a $4,500 and an
          $18,000 quote for the same bathroom are paralyzed; this teaches
          them to read the math behind any quote and shows where we sit. */}
      <section className="section-padding bg-white">
        <div className="container-custom">
          <div className="text-center mb-10 max-w-3xl mx-auto">
            <h2 className="heading-secondary mb-4">How tile pricing actually works</h2>
            <p className="text-body">
              Most quotes come back with a single number and no math. But every tile job has the same line items —
              labor days, waterproofing system, substrate prep, materials. Knowing what each contractor cuts (or
              includes) at their price is how you compare apples to apples.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {/* Bargain tier */}
            <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Bargain</p>
              <p className="text-2xl font-bold text-gray-900 mb-1">$400–600<span className="text-base font-normal text-gray-500">/day, 2 guys</span></p>
              <p className="text-sm text-gray-500 mb-5">Day-labor crews, side jobs, low-overhead shops.</p>
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">What gets cut</p>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">✕</span><span>No proper waterproofing membrane in showers (mastic over drywall)</span></li>
                <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">✕</span><span>Spot-bonded thinset — voids under tile = future cracks</span></li>
                <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">✕</span><span>Often unlicensed, uninsured, no written warranty</span></li>
                <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">✕</span><span>Hard to reach if something fails 6 months later</span></li>
              </ul>
              <p className="text-xs text-gray-500 mt-5 italic">
                Looks fine on day one. The leaks show up in year two.
              </p>
            </div>

            {/* Aguirre middle tier — featured */}
            <div className="bg-primary-600 text-white rounded-2xl p-6 shadow-xl ring-2 ring-primary-700 md:scale-[1.02] relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-primary-700 text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-sm">
                Where we sit
              </div>
              <p className="text-xs font-semibold text-primary-100 uppercase tracking-wider mb-2">Aguirre Modern Tile</p>
              <p className="text-2xl font-bold mb-1">$800–1,200<span className="text-base font-normal text-primary-200">/day, 2 guys</span></p>
              <p className="text-sm text-primary-100 mb-5">Licensed, insured, full system installs.</p>
              <p className="text-xs font-semibold text-primary-100 uppercase tracking-wider mb-3">What you get</p>
              <ul className="space-y-2 text-sm">
                <li className="flex gap-2"><Check className="w-4 h-4 text-green-300 flex-shrink-0 mt-0.5" /><span>Schluter KERDI / GO-BOARD waterproofing (full system, not patches)</span></li>
                <li className="flex gap-2"><Check className="w-4 h-4 text-green-300 flex-shrink-0 mt-0.5" /><span>Full thinset coverage, modified mortar, level prep</span></li>
                <li className="flex gap-2"><Check className="w-4 h-4 text-green-300 flex-shrink-0 mt-0.5" /><span>Licensed (MA HIC), $2M insured, 2-year workmanship warranty</span></li>
                <li className="flex gap-2"><Check className="w-4 h-4 text-green-300 flex-shrink-0 mt-0.5" /><span>Daily photo updates · 5-min response · same-day written estimates</span></li>
                <li className="flex gap-2"><Check className="w-4 h-4 text-green-300 flex-shrink-0 mt-0.5" /><span>15+ years, 220+ bathrooms a year, 150+ five-star reviews</span></li>
              </ul>
              <p className="text-xs text-primary-100 mt-5 italic">
                The mid-tier price for a job done to spec — not bargain shortcuts, not boutique markup.
              </p>
            </div>

            {/* Premium tier */}
            <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Boutique / Designer</p>
              <p className="text-2xl font-bold text-gray-900 mb-1">$1,500+<span className="text-base font-normal text-gray-500">/day, 2 guys</span></p>
              <p className="text-sm text-gray-500 mb-5">Design-build firms, GC-managed, brand-name shops.</p>
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">What you&apos;re paying for</p>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex gap-2"><Check className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" /><span>Designer-led project management + showroom curation</span></li>
                <li className="flex gap-2"><Check className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" /><span>Premium markup on tile + fixtures sourced through their channels</span></li>
                <li className="flex gap-2"><Check className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" /><span>Often a GC layer between you and the install crew</span></li>
                <li className="flex gap-2"><Check className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" /><span>Same install standards we already use</span></li>
              </ul>
              <p className="text-xs text-gray-500 mt-5 italic">
                Right choice for full-home gut renovations and curated design. Probably overkill for one bathroom.
              </p>
            </div>
          </div>

          <div className="text-center mt-10">
            <p className="text-gray-600 mb-4">
              Comparing quotes? Ask any contractor what waterproofing system they use, what their day rate is, and what&apos;s in their warranty.
              If they can&apos;t answer in one sentence each, that&apos;s your answer.
            </p>
            <a href="/contact" className="btn-cta inline-flex items-center gap-2">
              Get our written estimate <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Lead magnet: contractor screening checklist + tile-review offer.
          Ungated on purpose — the value is the questions themselves, which
          quietly disqualify cheap competitors who can't answer them. */}
      <section className="section-padding bg-gray-50">
        <div className="container-custom">
          <div className="grid lg:grid-cols-5 gap-8 max-w-5xl mx-auto">
            {/* Checklist — 3 cols */}
            <div className="lg:col-span-3">
              <p className="text-xs font-semibold text-primary-700 uppercase tracking-wider mb-2">
                Free homeowner&apos;s guide
              </p>
              <h2 className="heading-secondary mb-4">5 questions to ask any tile contractor before you sign</h2>
              <p className="text-gray-600 mb-6">
                Print this, screenshot it, whatever — bring it to every estimate. The right contractor will answer each one in a sentence.
              </p>

              <ol className="space-y-4">
                {[
                  {
                    q: 'What waterproofing system do you use in showers?',
                    a: 'Look for a named brand: Schluter KERDI, GO-BOARD, Wedi, RedGard. "Mastic" or "we just use cement board" is a wrong answer that leads to leaks within 2–3 years.',
                  },
                  {
                    q: 'What\'s your day rate for a 2-person crew?',
                    a: 'In Greater Boston, fair labor for a licensed installer is roughly $800–$1,200/day for a 2-person crew. Way below means corners are getting cut. Way above means you\'re paying for a designer middleman.',
                  },
                  {
                    q: 'Are you licensed and insured? Can you send proof?',
                    a: 'Massachusetts requires a Home Improvement Contractor (HIC) registration for jobs over $1,000. Ask for the number and a current Certificate of Insurance. Real contractors will text it to you in 5 minutes.',
                  },
                  {
                    q: 'What\'s the workmanship warranty in writing?',
                    a: 'Most tile failures show up in the first 6–18 months. A 1- to 2-year written warranty on the install (separate from manufacturer warranties on the tile itself) is the bare minimum.',
                  },
                  {
                    q: 'How will I see daily progress when I\'m at work?',
                    a: 'You should expect text or photo updates each day, not silence. If they "don\'t do that," ask yourself why.',
                  },
                ].map((item, i) => (
                  <li key={i} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                        {i + 1}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 mb-1">{item.q}</p>
                        <p className="text-sm text-gray-600">{item.a}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>

              <p className="text-sm text-gray-500 mt-6 italic">
                We answer all five in 30 seconds. If you&apos;re comparing us to another shop, hold us to the same standard you hold them to.
              </p>
            </div>

            {/* Lead magnets sidebar — 2 cols */}
            <div className="lg:col-span-2 space-y-4">
              {/* Free tile review */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600 mb-4">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Free tile review — before you buy</h3>
                <p className="text-sm text-gray-600 mb-4">
                  About to drop $1,500 on tile? Text Vince a photo or a product link first. He&apos;ll tell you in 5 minutes if it&apos;s rated for your application —
                  shower floor, wet area, large-format on a wavy subfloor, you name it. No commitment, no upsell.
                </p>
                <a
                  href="sms:+16177661259?body=Hi%20Vince%20%E2%80%94%20can%20you%20take%20a%20look%20at%20this%20tile%20I%E2%80%99m%20considering%3F"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-lg font-semibold text-sm hover:bg-primary-700 active:scale-95 transition"
                >
                  <Phone className="w-4 h-4" />
                  Text Vince a tile to review
                </a>
                <p className="text-xs text-gray-400 mt-2 text-center">(617) 766-1259 — text or call</p>
              </div>

              {/* In-home consult */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600 mb-4">
                  <Home className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Free in-home consult</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Photos can&apos;t catch everything. If your project is bigger than one bathroom or the subfloor looks questionable,
                  we&apos;ll come walk it with you — no charge, no obligation. Most visits are 20 minutes.
                </p>
                <a
                  href="/contact"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-white text-primary-700 border-2 border-primary-600 rounded-lg font-semibold text-sm hover:bg-primary-50 active:scale-95 transition"
                >
                  Book a 20-min visit
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>

              {/* Same-day written estimate */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600 mb-4">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Same-day written estimate</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Send 4–5 photos and we&apos;ll send back an itemized written quote — labor days, materials, scope, the works — usually within hours.
                </p>
                <a
                  href="/contact"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-white text-primary-700 border-2 border-primary-600 rounded-lg font-semibold text-sm hover:bg-primary-50 active:scale-95 transition"
                >
                  Send photos
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </div>
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
