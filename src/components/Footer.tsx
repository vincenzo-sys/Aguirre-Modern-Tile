import Link from 'next/link'
import Image from 'next/image'
import { Phone, Mail, MapPin, Clock, Star } from 'lucide-react'
import { getPayloadClient } from '@/lib/payload'

const defaultServices = [
  { name: 'Bathroom Tile Installation', href: '/services/bathroom-tile' },
  { name: 'Shower Tile Installation', href: '/services/shower-tile' },
  { name: 'Floor Tile Installation', href: '/services/floor-tile' },
  { name: 'Backsplash Tile Installation', href: '/services/backsplash-tile' },
  { name: 'Tile Repair', href: '/services/tile-repair' },
  { name: 'Tile Reglazing', href: '/services/tile-reglazing' },
]

const defaultServiceAreas = [
  'Revere', 'Boston', 'Cambridge', 'Somerville', 'Everett', 'Chelsea',
  'Malden', 'Medford', 'Melrose', 'Lynn', 'Saugus', 'Winthrop',
  'Brookline', 'Arlington', 'Belmont', 'Watertown',
]

export default async function Footer() {
  let services = defaultServices
  let serviceAreas = defaultServiceAreas
  let companyName = 'Aguirre Modern Tile'
  let tagline = 'Expert Tile Installation'
  let description = 'Professional tile installation in Greater Boston for over 15 years. Quality craftsmanship, fair pricing, and exceptional communication.'
  let phone = '(617) 766-1259'
  let email = 'vin@moderntile.pro'
  let address = '106 Pemberton St\nRevere, MA 02151'
  let hours = 'Mon-Sat: 7AM - 6PM'
  let rating = '4.9'
  let reviewCount = '150+'
  let footerLinks: { label: string; href: string }[] = [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
  ]

  try {
    const payload = await getPayloadClient()
    const [companyInfo, nav, svcData] = await Promise.all([
      payload.findGlobal({ slug: 'company-info' }),
      payload.findGlobal({ slug: 'navigation' }),
      payload.find({ collection: 'services', sort: 'sortOrder', limit: 20 }),
    ])

    if (companyInfo) {
      companyName = companyInfo.companyName || companyName
      tagline = companyInfo.tagline || tagline
      description = companyInfo.description || description
      phone = companyInfo.phone || phone
      email = companyInfo.email || email
      address = companyInfo.address || address
      hours = companyInfo.hours?.shortDisplay || hours
      rating = companyInfo.stats?.googleRating || rating
      reviewCount = companyInfo.stats?.reviewCount || reviewCount
    }

    if (svcData.docs.length > 0) {
      services = svcData.docs.map((s: any) => ({
        name: s.title,
        href: `/services/${s.slug}`,
      }))
    }

    if (nav) {
      if (nav.footerServiceAreas && nav.footerServiceAreas.length > 0) {
        serviceAreas = (nav.footerServiceAreas as any[]).map((a) => a.city)
      }
      if (nav.footerLinks && nav.footerLinks.length > 0) {
        footerLinks = nav.footerLinks as { label: string; href: string }[]
      }
    }
  } catch {
    // Payload not initialized yet — use defaults
  }

  const phoneDigits = phone.replace(/\D/g, '')
  const [street, cityState] = address.split('\n').length > 1 ? address.split('\n') : [address, '']

  return (
    <footer className="bg-gray-900 text-white">
      {/* Main Footer */}
      <div className="container-custom section-padding">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Company Info */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 relative rounded-lg overflow-hidden">
                <Image
                  src="/images/logo.jpg"
                  alt={companyName}
                  fill
                  className="object-cover"
                />
              </div>
              <div>
                <div className="font-bold text-xl">{companyName}</div>
                <div className="text-sm text-gray-400">{tagline}</div>
              </div>
            </div>
            <p className="text-gray-400 mb-6">{description}</p>
            <div className="flex items-center gap-2 text-yellow-400">
              <Star className="w-5 h-5 fill-current" />
              <span className="font-semibold">{rating}</span>
              <span className="text-gray-400">| {reviewCount} Google Reviews</span>
            </div>
          </div>

          {/* Services */}
          <div>
            <h3 className="font-bold text-lg mb-6">Our Services</h3>
            <ul className="space-y-3">
              {services.map((service) => (
                <li key={service.name}>
                  <Link
                    href={service.href}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {service.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Service Areas */}
          <div>
            <h3 className="font-bold text-lg mb-6">Service Areas</h3>
            <div className="grid grid-cols-2 gap-2">
              {serviceAreas.map((area) => (
                <span key={area} className="text-gray-400 text-sm">
                  {area}
                </span>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-bold text-lg mb-6">Contact Us</h3>
            <ul className="space-y-4">
              <li>
                <a
                  href={`tel:${phoneDigits}`}
                  className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors"
                >
                  <Phone className="w-5 h-5 text-primary-400" />
                  {phone}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${email}`}
                  className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors"
                >
                  <Mail className="w-5 h-5 text-primary-400" />
                  {email}
                </a>
              </li>
              <li className="flex items-start gap-3 text-gray-400">
                <MapPin className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
                <span>
                  {street}{cityState && <><br />{cityState}</>}
                </span>
              </li>
              <li className="flex items-center gap-3 text-gray-400">
                <Clock className="w-5 h-5 text-primary-400" />
                <span>{hours}</span>
              </li>
            </ul>

            <a
              href="/contact"
              className="btn-primary inline-block mt-6"
            >
              Get Free Estimate
            </a>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-gray-800">
        <div className="container-custom py-6 px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-gray-400 text-sm">
            &copy; {new Date().getFullYear()} {companyName}. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm">
            {footerLinks.map((link) => (
              <Link key={link.href} href={link.href} className="text-gray-400 hover:text-white transition-colors">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
