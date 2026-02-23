'use client'

import { use, useRef, useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  Phone,
  Mail,
  Download,
  CheckCircle,
  Shield,
  Award,
  Clock,
  Star,
  Calendar,
  MapPin,
  FileText,
  Plus,
  ArrowRight,
  Play,
  User,
  Sparkles,
  Timer,
  CreditCard,
  MessageCircle,
  Check,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import {
  getQuoteById,
  getSimilarProjectImages,
  getUpsells,
  customerReviews,
  type Quote,
} from '@/data/quotes'
import { toast } from '@/components/Toast'

interface Props {
  params: Promise<{ id: string }>
}

// FAQ data
const commonFAQs = [
  {
    question: "What if I need to reschedule?",
    answer: "Life happens! We're flexible with scheduling. Just give us 48 hours notice and we'll find a new date that works for you at no extra charge."
  },
  {
    question: "What about cleanup?",
    answer: "We leave your home cleaner than we found it. We lay protective coverings, contain dust, and do a thorough cleanup at the end of each day. You won't know we were there (except for your beautiful new tile!)."
  },
  {
    question: "Do I need to be home during the work?",
    answer: "Not necessarily. Many clients give us a key or garage code. We'll send you photo updates throughout the day so you can see progress in real-time."
  },
  {
    question: "What's your warranty?",
    answer: "We stand behind our work with a 2-year workmanship warranty. If anything comes loose, cracks, or fails due to installation, we fix it free. Most tile issues show up within months, so 2 years gives you real peace of mind."
  },
  {
    question: "How do payments work?",
    answer: "We collect a deposit to secure your spot on our schedule and order materials. The balance is due when the job is complete and you're 100% satisfied. We accept checks, cards, and bank transfers."
  },
]

export default function QuoteProposalPage({ params }: Props) {
  const { id } = use(params)
  const quote = getQuoteById(id)
  const printRef = useRef<HTMLDivElement>(null)
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0 })
  const [openFAQ, setOpenFAQ] = useState<number | null>(null)
  const [showAcceptModal, setShowAcceptModal] = useState(false)

  useEffect(() => {
    if (!quote) return

    const calculateTimeLeft = () => {
      const expiry = new Date(quote.expiresAt).getTime()
      const now = new Date().getTime()
      const difference = expiry - now

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
        })
      }
    }

    calculateTimeLeft()
    const timer = setInterval(calculateTimeLeft, 60000)
    return () => clearInterval(timer)
  }, [quote])

  if (!quote) {
    notFound()
  }

  const similarImages = getSimilarProjectImages(quote.project.type)
  const upsells = getUpsells(quote.project.type)

  const handleDownloadPDF = () => {
    window.print()
  }

  const projectTypeLabels: Record<string, string> = {
    bathroom: 'Bathroom Tile',
    shower: 'Shower Tile',
    floor: 'Floor Tile',
    backsplash: 'Backsplash',
    repair: 'Tile Repair',
    reglazing: 'Tile Reglazing',
    other: 'Tile Project',
  }

  const isExpired = new Date(quote.expiresAt) < new Date()
  const monthlyPayment = Math.round(quote.total / 12)

  // What's included checklist
  const whatsIncluded = [
    'All labor and installation',
    'Surface preparation and leveling',
    'Waterproofing (where applicable)',
    'Premium thinset and grout',
    'Professional-grade sealant',
    'Daily cleanup and debris removal',
    'Final walkthrough and touch-ups',
    '2-year workmanship warranty',
  ]

  return (
    <>
      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          header, footer, .no-print {
            display: none !important;
          }
          .print-break {
            page-break-before: always;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>

      <div ref={printRef} className="bg-gray-50 min-h-screen">
        {/* Sticky Header */}
        <div className="sticky top-0 z-50 bg-white border-b shadow-sm no-print">
          <div className="container-custom px-4">
            <div className="flex justify-between items-center py-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 relative rounded-lg overflow-hidden">
                  <Image src="/images/logo.jpg" alt="Aguirre Modern Tile" fill className="object-cover" />
                </div>
                <div className="hidden sm:block">
                  <div className="font-semibold text-gray-900">Quote #{quote.id}</div>
                  <div className="text-xs text-gray-500">for {quote.customer.name}</div>
                </div>
              </div>

              {/* Countdown Timer */}
              {!isExpired && (
                <div className="flex items-center gap-2 text-sm">
                  <Timer className="w-4 h-4 text-orange-500" />
                  <span className="text-gray-600">Expires in:</span>
                  <div className="flex gap-1">
                    <span className="bg-gray-900 text-white px-2 py-1 rounded font-mono text-xs">{timeLeft.days}d</span>
                    <span className="bg-gray-900 text-white px-2 py-1 rounded font-mono text-xs">{timeLeft.hours}h</span>
                    <span className="bg-gray-900 text-white px-2 py-1 rounded font-mono text-xs">{timeLeft.minutes}m</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <a href="tel:6177661259" className="hidden md:flex items-center gap-2 text-gray-600 hover:text-primary-600 px-3 py-2">
                  <Phone className="w-4 h-4" />
                  <span className="text-sm font-medium">Call</span>
                </a>
                <button
                  onClick={() => setShowAcceptModal(true)}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span className="hidden sm:inline">Accept Quote</span>
                  <span className="sm:hidden">Accept</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Hero Section with Video Message Placeholder */}
        <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-primary-900 text-white py-12 md:py-16">
          <div className="container-custom px-4">
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 mb-6">
                  <Sparkles className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm">Prepared specially for you</span>
                </div>

                <h1 className="text-3xl md:text-4xl font-bold mb-4">
                  Hi {quote.customer.name.split(' ')[0]}, here's your quote for your {projectTypeLabels[quote.project.type].toLowerCase()} project
                </h1>

                <p className="text-xl text-gray-300 mb-6">
                  {quote.project.title}
                </p>

                <div className="flex items-baseline gap-3 mb-6">
                  <span className="text-4xl md:text-5xl font-bold">${quote.total.toLocaleString()}</span>
                  <span className="text-gray-400">total project cost</span>
                </div>

                {/* Financing teaser */}
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 mb-6 inline-block">
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-5 h-5 text-green-400" />
                    <div>
                      <span className="text-green-400 font-semibold">Financing available</span>
                      <span className="text-gray-300 ml-2">as low as ${monthlyPayment}/month</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4">
                  <button
                    onClick={() => setShowAcceptModal(true)}
                    className="btn-cta flex items-center gap-2"
                  >
                    <Check className="w-5 h-5" />
                    Accept Quote
                  </button>
                  <a href="tel:6177661259" className="btn-outline-white flex items-center gap-2">
                    <Phone className="w-5 h-5" />
                    Questions? Call Us
                  </a>
                </div>
              </div>

              {/* Personal Video Message */}
              <div className="relative">
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 rounded-full bg-primary-600 flex items-center justify-center">
                      <User className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">A message from Christian</h3>
                      <p className="text-gray-300 text-sm">Owner, Aguirre Modern Tile</p>
                    </div>
                  </div>

                  {/* Video placeholder - would be real video in production */}
                  <div className="relative aspect-video bg-gray-800 rounded-xl overflow-hidden group cursor-pointer">
                    <Image
                      src="/images/bathroom-service1.jpg"
                      alt="Video thumbnail"
                      fill
                      className="object-cover opacity-70"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                        <Play className="w-6 h-6 text-primary-600 ml-1" />
                      </div>
                    </div>
                    <div className="absolute bottom-4 left-4 right-4">
                      <p className="text-sm text-white bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2">
                        "I personally reviewed your project and put together this quote..."
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="container-custom px-4 py-8 md:py-12">

          {/* What's Included */}
          <div className="bg-white rounded-2xl shadow-sm p-6 md:p-8 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-green-500" />
              What's Included in Your Quote
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {whatsIncluded.map((item, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-gray-700">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Project Details & Line Items */}
          <div className="bg-white rounded-2xl shadow-sm p-6 md:p-8 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Project Details</h2>
            <p className="text-gray-700 leading-relaxed mb-6 p-4 bg-gray-50 rounded-xl">{quote.project.description}</p>

            <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 text-sm font-semibold text-gray-500 uppercase">Item</th>
                    <th className="text-right py-3 text-sm font-semibold text-gray-500 uppercase">Qty</th>
                    <th className="text-right py-3 text-sm font-semibold text-gray-500 uppercase">Rate</th>
                    <th className="text-right py-3 text-sm font-semibold text-gray-500 uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.lineItems.map((item, index) => (
                    <tr key={index} className="border-b border-gray-100">
                      <td className="py-4 text-gray-900">{item.description}</td>
                      <td className="py-4 text-right text-gray-600">
                        {item.quantity ? `${item.quantity} ${item.unit || ''}` : '-'}
                      </td>
                      <td className="py-4 text-right text-gray-600">
                        {item.unitPrice ? `$${item.unitPrice}` : '-'}
                      </td>
                      <td className="py-4 text-right font-medium text-gray-900">
                        ${item.total.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="border-t border-gray-200 mt-4 pt-4">
              <div className="flex justify-end">
                <div className="w-72 space-y-2">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>${quote.subtotal.toLocaleString()}</span>
                  </div>
                  {quote.discount && (
                    <div className="flex justify-between text-green-600 font-medium">
                      <span>{quote.discount.description}</span>
                      <span>-${quote.discount.amount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-2xl font-bold text-gray-900 pt-3 border-t">
                    <span>Total</span>
                    <span>${quote.total.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Next Steps Timeline */}
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl p-6 md:p-8 mb-8 text-white no-print">
            <h2 className="text-xl font-bold mb-6 text-center">What Happens After You Accept</h2>
            <div className="grid md:grid-cols-4 gap-6">
              {[
                { step: 1, title: 'You Accept', desc: 'Click accept and pay deposit to lock in your spot' },
                { step: 2, title: 'We Schedule', desc: "We'll call within 24 hours to schedule your start date" },
                { step: 3, title: 'We Order Materials', desc: 'We order all tile and materials for your project' },
                { step: 4, title: 'We Transform', desc: 'Our team arrives and creates your dream space' },
              ].map((item, index) => (
                <div key={index} className="text-center relative">
                  <div className="w-12 h-12 bg-white text-primary-600 rounded-full flex items-center justify-center font-bold text-xl mx-auto mb-3">
                    {item.step}
                  </div>
                  <h3 className="font-semibold mb-1">{item.title}</h3>
                  <p className="text-primary-100 text-sm">{item.desc}</p>
                  {index < 3 && (
                    <div className="hidden md:block absolute top-6 left-[60%] w-[80%] h-0.5 bg-primary-400/30" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Before/After Gallery */}
          <div className="bg-white rounded-2xl shadow-sm p-6 md:p-8 mb-8 no-print">
            <h2 className="text-xl font-bold text-gray-900 mb-2">See the Transformation</h2>
            <p className="text-gray-600 mb-6">Real projects from homeowners like you</p>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Before/After pair 1 */}
              <div className="space-y-2">
                <div className="relative aspect-[4/3] rounded-xl overflow-hidden">
                  <Image
                    src={similarImages[0]}
                    alt="After transformation"
                    fill
                    className="object-cover"
                  />
                  <div className="absolute top-3 left-3 bg-green-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    AFTER
                  </div>
                </div>
                <p className="text-sm text-gray-500 text-center">Complete bathroom transformation in Cambridge</p>
              </div>

              {/* Project gallery */}
              <div className="grid grid-cols-2 gap-2">
                {similarImages.slice(1, 5).map((image, index) => (
                  <div key={index} className="relative aspect-square rounded-xl overflow-hidden">
                    <Image
                      src={image}
                      alt={`Project ${index + 2}`}
                      fill
                      className="object-cover hover:scale-105 transition-transform"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="text-center mt-6">
              <Link href="/gallery" className="text-primary-600 font-medium hover:text-primary-700 inline-flex items-center gap-1">
                View 50+ more projects <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Our Guarantee */}
          <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-6 md:p-8 mb-8 no-print">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                <Shield className="w-10 h-10 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Our 100% Satisfaction Guarantee</h2>
                <p className="text-gray-700">
                  We're not happy until you're thrilled. If anything isn't perfect, tell us and we'll make it right—no questions asked.
                  Plus, every project comes with our <strong>2-year workmanship warranty</strong>. If anything we installed fails,
                  we fix it free.
                </p>
              </div>
            </div>
          </div>

          {/* Trust Signals */}
          <div className="bg-white rounded-2xl shadow-sm p-6 md:p-8 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">Why Homeowners Trust Us</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Shield className="w-7 h-7 text-primary-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Licensed</h3>
                <p className="text-sm text-gray-500">MA HIC #123456</p>
              </div>
              <div className="text-center">
                <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Shield className="w-7 h-7 text-primary-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Insured</h3>
                <p className="text-sm text-gray-500">$2M Liability Coverage</p>
              </div>
              <div className="text-center">
                <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Award className="w-7 h-7 text-primary-600" />
                </div>
                <h3 className="font-semibold text-gray-900">15+ Years</h3>
                <p className="text-sm text-gray-500">In Business</p>
              </div>
              <div className="text-center">
                <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Star className="w-7 h-7 text-primary-600" />
                </div>
                <h3 className="font-semibold text-gray-900">5.0 Stars</h3>
                <p className="text-sm text-gray-500">150+ Reviews</p>
              </div>
            </div>
          </div>

          {/* Customer Reviews */}
          <div className="bg-white rounded-2xl shadow-sm p-6 md:p-8 mb-8 no-print">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Don't Just Take Our Word For It</h2>
              <div className="flex items-center justify-center gap-2">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                  ))}
                </div>
                <span className="font-semibold">5.0</span>
                <span className="text-gray-500">from 150+ reviews</span>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {customerReviews.map((review, index) => (
                <div key={index} className="bg-gray-50 rounded-xl p-5">
                  <div className="flex gap-1 mb-3">
                    {[...Array(review.rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />
                    ))}
                  </div>
                  <p className="text-gray-700 text-sm mb-4 italic">"{review.text}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                      <span className="text-primary-600 font-semibold">{review.name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{review.name}</p>
                      <p className="text-xs text-gray-500">{review.project} • {review.location}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center mt-6">
              <a
                href="https://www.google.com/maps/place/Aguirre+Modern+Tile"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 font-medium hover:text-primary-700 inline-flex items-center gap-1"
              >
                Read all Google reviews <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Upsells */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6 md:p-8 mb-8 no-print">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-amber-600" />
              <h2 className="text-xl font-bold text-gray-900">Popular Add-Ons</h2>
            </div>
            <p className="text-gray-600 mb-6">Customers with similar projects often add these</p>

            <div className="grid md:grid-cols-3 gap-4">
              {upsells.map((upsell, index) => (
                <div key={index} className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer border-2 border-transparent hover:border-amber-300">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Plus className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{upsell.title}</h3>
                      <p className="text-sm text-gray-600 mt-1">{upsell.description}</p>
                      <p className="text-amber-600 font-semibold text-sm mt-2">{upsell.price}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-center text-gray-600 mt-6 text-sm">
              <MessageCircle className="w-4 h-4 inline mr-1" />
              Want to add any of these? Just mention it when we call to schedule!
            </p>
          </div>

          {/* FAQ Section */}
          <div className="bg-white rounded-2xl shadow-sm p-6 md:p-8 mb-8 no-print">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <HelpCircle className="w-6 h-6 text-primary-600" />
              Common Questions
            </h2>
            <div className="space-y-3">
              {commonFAQs.map((faq, index) => (
                <div key={index} className="border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setOpenFAQ(openFAQ === index ? null : index)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="font-medium text-gray-900">{faq.question}</span>
                    {openFAQ === index ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                  {openFAQ === index && (
                    <div className="px-4 pb-4 text-gray-600">
                      {faq.answer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Meet Christian */}
          <div className="bg-white rounded-2xl shadow-sm p-6 md:p-8 mb-8 no-print">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="w-32 h-32 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-16 h-16 text-primary-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Meet Christian Aguirre</h2>
                <p className="text-gray-600 mb-4">
                  I started Aguirre Modern Tile over 15 years ago with one goal: deliver the kind of quality
                  and service I'd want in my own home. Every project we take on gets my personal attention.
                  I review every quote, and I'm always just a phone call away if you have questions.
                </p>
                <p className="text-gray-600">
                  I'm looking forward to working with you on your {projectTypeLabels[quote.project.type].toLowerCase()} project!
                </p>
              </div>
            </div>
          </div>

          {/* Payment Terms */}
          <div className="bg-gray-900 text-white rounded-2xl p-6 md:p-8 mb-8">
            <h2 className="text-xl font-bold mb-4">Payment Details</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-gray-300 mb-2">Payment Schedule</h3>
                <p className="text-lg">{quote.paymentTerms}</p>
                {quote.depositRequired && (
                  <p className="mt-3 text-2xl font-bold text-green-400">
                    Deposit: ${quote.depositRequired.toLocaleString()}
                  </p>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-gray-300 mb-2">We Accept</h3>
                <div className="flex flex-wrap gap-2">
                  {['Check', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Zelle'].map((method) => (
                    <span key={method} className="bg-gray-800 px-3 py-1 rounded-full text-sm">
                      {method}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-gray-400 text-sm">
                  Financing available through our partners. Ask for details.
                </p>
              </div>
            </div>
          </div>

          {/* Final CTA */}
          <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-2xl p-8 md:p-12 text-white text-center no-print">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Ready to Transform Your Space?</h2>
            <p className="text-green-100 mb-8 max-w-xl mx-auto text-lg">
              Lock in this price and secure your spot on our schedule.
            </p>

            <button
              onClick={() => setShowAcceptModal(true)}
              className="bg-white text-green-600 px-8 py-4 rounded-xl font-bold text-lg hover:bg-green-50 transition-colors shadow-lg inline-flex items-center gap-2"
            >
              <Check className="w-6 h-6" />
              Accept Quote & Schedule Project
            </button>

            <p className="mt-6 text-green-200 text-sm">
              Or call us at <a href="tel:6177661259" className="underline font-semibold">(617) 766-1259</a> with any questions
            </p>
          </div>

          {/* Footer */}
          <div className="text-center py-8 text-gray-500 text-sm">
            <p>Aguirre Modern Tile • (617) 766-1259 • christian@aguirremoderntile.com</p>
            <p className="mt-1">Licensed • Insured • Greater Boston Area</p>
            <button
              onClick={handleDownloadPDF}
              className="mt-4 text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
            >
              <Download className="w-4 h-4" />
              Download PDF Copy
            </button>
          </div>
        </div>
      </div>

      {/* Accept Modal */}
      {showAcceptModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 md:p-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Accept Quote</h3>
            <p className="text-gray-600 mb-6">
              You're accepting quote #{quote.id} for <strong>${quote.total.toLocaleString()}</strong>
            </p>

            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <p className="text-sm text-gray-600">
                By clicking "Confirm & Pay Deposit", you agree to the terms of this quote.
                We'll contact you within 24 hours to schedule your project.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  // In production, this would go to payment
                  toast('This would redirect to payment processing (Stripe) in production.')
                  setShowAcceptModal(false)
                }}
                className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
              >
                <CreditCard className="w-5 h-5" />
                Confirm & Pay ${quote.depositRequired?.toLocaleString()} Deposit
              </button>

              <button
                onClick={() => setShowAcceptModal(false)}
                className="w-full bg-gray-100 text-gray-600 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
              >
                I Have Questions First
              </button>
            </div>

            <p className="text-center text-sm text-gray-500 mt-4">
              Questions? Call <a href="tel:6177661259" className="text-primary-600">(617) 766-1259</a>
            </p>
          </div>
        </div>
      )}
    </>
  )
}
