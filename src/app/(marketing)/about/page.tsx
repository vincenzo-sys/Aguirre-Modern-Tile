import { Metadata } from 'next'
import { Star, Award, Users, Heart, Shield } from 'lucide-react'
import { getCmsGlobal, getCmsCollection } from '@/lib/cms'

export const metadata: Metadata = {
  title: 'About Us | Aguirre Modern Tile',
  description: 'Learn about Aguirre Modern Tile. 15+ years of expert tile installation in Greater Boston. Meet Christian and Vin, the team behind your project.',
}

const defaultValues = [
  { title: 'Quality First', description: "We never cut corners. Every job gets the same attention to detail, whether it's a small repair or a full bathroom renovation." },
  { title: 'Clear Communication', description: "We believe you should know what's happening with your project. Expect updates, honesty, and a response within 5 minutes." },
  { title: 'Fair Pricing', description: 'We charge fairly so we can do the job right. No hidden fees, no surprises—just honest work at honest prices.' },
]

const defaultTeam = [
  { name: 'Christian Aguirre', role: 'Founder & Lead Installer', bio: 'With 15+ years of hands-on experience, Christian leads every major project. His attention to detail and commitment to proper technique sets the standard for the entire team.' },
  { name: 'Vin Aguirre', role: 'Operations & Customer Relations', bio: "Vin handles estimates, scheduling, and makes sure every customer has a great experience. When you call, he's the one who picks up in 5 minutes." },
]

export default async function AboutPage() {
  let values = defaultValues
  let team = defaultTeam
  let stats = [
    { number: '15+', label: 'Years Experience' },
    { number: '220+', label: 'Bathrooms Per Year' },
    { number: '150+', label: 'Five-Star Reviews' },
    { number: '5 min', label: 'Response Time' },
  ]
  let story = "Aguirre Modern Tile started with a simple belief: homeowners deserve contractors who show up, communicate, and do the job right the first time.\n\nFor over 15 years, we've been transforming bathrooms across Greater Boston. What started as a small operation has grown into a trusted team that completes over 220 bathroom projects every year.\n\nOur reputation is built on doing things the right way—proper waterproofing, quality materials, and craftsmanship that lasts. We're not the cheapest, and we're not the most expensive. We're the ones who answer the phone, show up on time, and leave you with a bathroom you'll love."
  let hicNumber = '#000000'
  let liabilityCoverage = '$1M Coverage'
  let rating = '4.9'
  let reviewCount = '150+'

  try {
    const [companyInfo, teamData] = await Promise.all([
      getCmsGlobal<any>('company-info'),
      getCmsCollection<any>('team-members', { sort: 'sortOrder', limit: '10' }),
    ])

    if (companyInfo) {
      if (companyInfo.values && (companyInfo.values as any[]).length > 0) {
        values = (companyInfo.values as any[]).map((v) => ({ title: v.title, description: v.description }))
      }
      if (companyInfo.story) story = companyInfo.story
      if (companyInfo.stats) {
        stats = [
          { number: companyInfo.stats.yearsExperience || '15+', label: 'Years Experience' },
          { number: companyInfo.stats.bathroomsPerYear || '220+', label: 'Bathrooms Per Year' },
          { number: companyInfo.stats.reviewCount || '150+', label: 'Five-Star Reviews' },
          { number: companyInfo.stats.responseTime || '5 min', label: 'Response Time' },
        ]
        rating = companyInfo.stats.googleRating || rating
        reviewCount = companyInfo.stats.reviewCount || reviewCount
      }
      if (companyInfo.licenses) {
        hicNumber = companyInfo.licenses.hicNumber || hicNumber
        liabilityCoverage = companyInfo.licenses.liabilityCoverage ? `${companyInfo.licenses.liabilityCoverage} Coverage` : liabilityCoverage
      }
    }

    if (teamData && teamData.docs.length > 0) {
      team = teamData.docs.map((m: any) => ({ name: m.name, role: m.role, bio: m.bio }))
    }
  } catch {
    // CMS not available — use defaults
  }

  const valueIcons = [
    <Award key="0" className="w-8 h-8" />,
    <Users key="1" className="w-8 h-8" />,
    <Heart key="2" className="w-8 h-8" />,
  ]

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 to-primary-900 text-white section-padding">
        <div className="container-custom">
          <div className="max-w-3xl">
            <h1 className="heading-primary text-white mb-6">About Aguirre Modern Tile</h1>
            <p className="text-xl text-gray-300">
              We&apos;re a family-owned tile installation company serving Greater Boston.
              Quality craftsmanship, honest communication, and fair pricing—that&apos;s our promise.
            </p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 bg-primary-600 text-white">
        <div className="container-custom">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-4xl font-bold mb-2">{stat.number}</div>
                <div className="text-primary-200">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Story */}
      <section className="section-padding">
        <div className="container-custom">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="heading-secondary mb-6">Our Story</h2>
              <div className="space-y-4 text-body">
                {story.split('\n\n').map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            </div>
            <div className="bg-gray-200 rounded-2xl aspect-square">
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                [Team Photo Placeholder]
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Meet the Team */}
      <section className="section-padding bg-gray-50">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="heading-secondary mb-4">Meet the Team</h2>
            <p className="text-body max-w-2xl mx-auto">
              The people behind your project. We&apos;re hands-on and personally invested
              in every bathroom we build.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {team.map((member) => (
              <div key={member.name} className="bg-white rounded-2xl p-8 text-center shadow-sm">
                <div className="w-32 h-32 bg-gray-200 rounded-full mx-auto mb-6"></div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{member.name}</h3>
                <p className="text-primary-600 font-medium mb-4">{member.role}</p>
                <p className="text-gray-600">{member.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Values */}
      <section className="section-padding">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="heading-secondary mb-4">Our Values</h2>
            <p className="text-body max-w-2xl mx-auto">
              These aren&apos;t just words on a wall. They guide every decision we make.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {values.map((value, index) => (
              <div key={value.title} className="text-center">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center text-primary-600 mx-auto mb-6">
                  {valueIcons[index] || <Award className="w-8 h-8" />}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{value.title}</h3>
                <p className="text-gray-600">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* License & Insurance */}
      <section className="section-padding bg-gray-50">
        <div className="container-custom">
          <div className="max-w-3xl mx-auto text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Shield className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="heading-secondary mb-4">Licensed & Insured</h2>
            <p className="text-body mb-8">
              We carry full liability insurance and workers&apos; compensation coverage.
              Your home and our team are protected on every job.
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <span className="text-gray-500 text-sm">Massachusetts HIC License</span>
                <p className="font-semibold text-gray-900">{hicNumber}</p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <span className="text-gray-500 text-sm">General Liability Insurance</span>
                <p className="font-semibold text-gray-900">{liabilityCoverage}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Reviews */}
      <section className="section-padding">
        <div className="container-custom text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="flex">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-8 h-8 text-yellow-400 fill-current" />
              ))}
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 mb-2">{rating} Stars from {reviewCount} Reviews</p>
          <p className="text-body mb-6">
            Don&apos;t just take our word for it—see what our customers have to say.
          </p>
          <a
            href="https://www.google.com/maps/place/Aguirre+Modern+Tile"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
          >
            Read Our Google Reviews
          </a>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding bg-primary-600 text-white">
        <div className="container-custom text-center">
          <h2 className="heading-secondary text-white mb-4">Ready to Work Together?</h2>
          <p className="text-xl text-primary-100 mb-8">
            Let&apos;s talk about your project. We&apos;ll get back to you within 5 minutes.
          </p>
          <a href="/contact" className="btn-cta">
            Get Your Free Estimate
          </a>
        </div>
      </section>
    </>
  )
}
