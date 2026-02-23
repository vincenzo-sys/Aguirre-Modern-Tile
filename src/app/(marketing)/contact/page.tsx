import { Metadata } from 'next'
import { Phone, Mail, MapPin, Clock, MessageCircle } from 'lucide-react'
import PhotoUploadForm from '@/components/PhotoUploadForm'
import ServiceAreaMap from '@/components/ServiceAreaMap'
import { getPayloadClient } from '@/lib/payload'

export const metadata: Metadata = {
  title: 'Contact Us | Aguirre Modern Tile',
  description: 'Get a free tile installation estimate. Upload photos for same-day pricing. Call (617) 766-1259 or email vin@moderntile.pro.',
}

const defaultFAQs = [
  { question: 'How quickly can you start my project?', answer: 'It depends on our schedule, but typically we can start within 1-3 weeks. For urgent repairs, we can often accommodate sooner.' },
  { question: 'Do you provide materials, or do I need to buy tile?', answer: "We can work either way! Many customers choose their own tile, and we handle all the underlayment, waterproofing, and installation materials. We're happy to recommend tile suppliers if needed." },
  { question: 'What areas do you serve?', answer: 'We serve Greater Boston including Revere, Boston, Cambridge, Somerville, Everett, Chelsea, Malden, Medford, Melrose, Lynn, Saugus, Winthrop, Brookline, Arlington, Belmont, Watertown, and surrounding areas.' },
  { question: 'Do you offer financing?', answer: "We don't offer financing directly, but we accept all major credit cards which can be used with your card's financing options. We also offer payment schedules for larger projects." },
]

export default async function ContactPage() {
  let phone = '(617) 766-1259'
  let email = 'vin@moderntile.pro'
  let hours = {
    weekday: 'Monday - Friday: 7:00 AM - 6:00 PM',
    saturday: 'Saturday: 8:00 AM - 4:00 PM',
    sunday: 'Sunday: Closed (emergencies only)',
  }
  let faqs = defaultFAQs

  try {
    const payload = await getPayloadClient()
    const [companyInfo, faqData] = await Promise.all([
      payload.findGlobal({ slug: 'company-info' }),
      payload.find({ collection: 'faqs', sort: 'sortOrder', limit: 20 }),
    ])

    if (companyInfo) {
      phone = companyInfo.phone || phone
      email = companyInfo.email || email
      if (companyInfo.hours) {
        hours = {
          weekday: companyInfo.hours.weekday || hours.weekday,
          saturday: companyInfo.hours.saturday || hours.saturday,
          sunday: companyInfo.hours.sunday || hours.sunday,
        }
      }
    }

    if (faqData.docs.length > 0) {
      faqs = faqData.docs.map((f: any) => ({ question: f.question, answer: f.answer }))
    }
  } catch {
    // Payload not initialized yet — use defaults
  }

  const phoneDigits = phone.replace(/\D/g, '')

  const contactMethods = [
    { icon: <Phone className="w-6 h-6" />, title: 'Phone', value: phone, href: `tel:${phoneDigits}`, description: 'We answer in 5 minutes or less' },
    { icon: <Mail className="w-6 h-6" />, title: 'Email', value: email, href: `mailto:${email}`, description: 'For detailed inquiries' },
    { icon: <MessageCircle className="w-6 h-6" />, title: 'Text', value: phone, href: `sms:${phoneDigits}`, description: 'Quick questions & photos' },
  ]

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 to-primary-900 text-white section-padding">
        <div className="container-custom">
          <div className="max-w-3xl">
            <h1 className="heading-primary text-white mb-6">Get Your Free Estimate</h1>
            <p className="text-xl text-gray-300">
              Upload photos of your project and we&apos;ll send you a same-day ballpark estimate.
              No commitment, no pressure—just honest pricing.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Methods */}
      <section className="py-12 bg-white border-b">
        <div className="container-custom">
          <div className="grid md:grid-cols-3 gap-6">
            {contactMethods.map((method) => (
              <a
                key={method.title}
                href={method.href}
                className="flex items-center gap-4 p-6 bg-gray-50 rounded-xl hover:bg-primary-50 transition-colors"
              >
                <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600">
                  {method.icon}
                </div>
                <div>
                  <p className="text-sm text-gray-500">{method.title}</p>
                  <p className="font-semibold text-gray-900">{method.value}</p>
                  <p className="text-sm text-gray-500">{method.description}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="section-padding">
        <div className="container-custom">
          <div className="grid lg:grid-cols-2 gap-12">
            {/* Photo Upload Form */}
            <div>
              <h2 className="heading-secondary mb-6">Send Us Your Project Details</h2>
              <p className="text-body mb-8">
                The more photos and details you share, the more accurate our estimate will be.
                Include measurements if you have them!
              </p>

              <div className="bg-white rounded-2xl shadow-lg p-8">
                <PhotoUploadForm />
              </div>
            </div>

            {/* Office Info */}
            <div>
              <h2 className="heading-secondary mb-6">Our Service Area</h2>

              {/* Service Area Map */}
              <div className="mb-6">
                <ServiceAreaMap />
                <p className="text-sm text-gray-500 mt-2 text-center">
                  Serving 60+ cities and towns across Greater Boston
                </p>
              </div>

              {/* Location Card */}
              <div className="bg-gray-50 rounded-xl p-6 mb-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600 flex-shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">Based in Revere, MA</h3>
                    <p className="text-gray-600">
                      Serving Greater Boston, the North Shore, and surrounding communities
                    </p>
                  </div>
                </div>
              </div>

              {/* Hours Card */}
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600 flex-shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">Hours</h3>
                    <div className="text-gray-600 space-y-1">
                      <p>{hours.weekday}</p>
                      <p>{hours.saturday}</p>
                      <p>{hours.sunday}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Response Time Note */}
              <div className="mt-6 p-4 bg-green-50 rounded-xl border border-green-200">
                <div className="flex items-center gap-2 text-green-800">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="font-medium">We typically respond within 5 minutes</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="section-padding bg-gray-50">
        <div className="container-custom">
          <h2 className="heading-secondary text-center mb-12">Frequently Asked Questions</h2>

          <div className="max-w-3xl mx-auto space-y-6">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-2">{faq.question}</h3>
                <p className="text-gray-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
