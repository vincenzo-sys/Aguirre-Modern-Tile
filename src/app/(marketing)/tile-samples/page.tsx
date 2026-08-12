import { Metadata } from 'next'
import Link from 'next/link'
import { Check, Truck, Ruler, Palette, Star, ShieldCheck } from 'lucide-react'
import TileKitForm from '@/components/TileKitForm'
import JsonLd, { faqJsonLd, breadcrumbJsonLd } from '@/components/JsonLd'
import { TILE_KIT, KIT_SERVICE_TOWNS } from '@/data/tileKit'

export const metadata: Metadata = {
  title: `Tile Match Kit — ${TILE_KIT.sampleCount} Samples for $${TILE_KIT.price} | Aguirre Modern Tile`,
  description: `Stop guessing from photos. ${TILE_KIT.sampleCount} real tile samples hand-picked for your project and delivered in Greater Boston in ${TILE_KIT.turnaroundDays} days. Your $${TILE_KIT.price} comes back as $${TILE_KIT.installCredit} off your install.`,
  alternates: { canonical: '/tile-samples' },
  openGraph: {
    title: `Tile Match Kit — ${TILE_KIT.sampleCount} real samples, $${TILE_KIT.price}`,
    description: `Hand-picked tile samples delivered across Greater Boston. Credited back toward your install.`,
    url: 'https://aguirremoderntile.com/tile-samples',
    type: 'website',
  },
}

const faqs = [
  {
    question: `Why does the Tile Match Kit cost $${TILE_KIT.price}?`,
    answer: `Because free sample programs get abused and we hand-deliver these ourselves. The $${TILE_KIT.price} covers the pull and the drop-off — and it comes straight back to you as $${TILE_KIT.installCredit} off your install, so if you hire us the kit is better than free.`,
  },
  {
    question: 'What exactly is in the kit?',
    answer: `${TILE_KIT.sampleCount} full tile samples chosen by hand for your room, your style picks and your budget — plus a grout color card and a one-page cost-per-square-foot sheet so you know what each option actually costs installed.`,
  },
  {
    question: 'How fast do I get it?',
    answer: `Within ${TILE_KIT.turnaroundDays} business days. We deliver in person across our service area, so there is no shipping wait and nothing to return.`,
  },
  {
    question: 'Do I have to hire you to get the kit?',
    answer: 'No. The samples are yours to keep either way. Most people use them to make a decision, and a lot of those people end up booking the install with us.',
  },
  {
    question: 'How does the install credit work?',
    answer: `Book a tile installation with us within 90 days and we take $${TILE_KIT.installCredit} off the final invoice on any job over $${TILE_KIT.creditMinimumJob}. No code to remember — it is attached to your name.`,
  },
  {
    question: 'Which towns do you deliver to?',
    answer: `${KIT_SERVICE_TOWNS.join(', ')} and the surrounding Greater Boston area. If your town is not listed, call (617) 766-1259 and we will tell you straight if we can reach you.`,
  },
]

const steps = [
  {
    icon: Palette,
    title: 'Tell us your look',
    body: 'Pick the styles you are drawn to and the room you are tiling. Takes about 60 seconds.',
  },
  {
    icon: Truck,
    title: 'We hand-deliver your kit',
    body: `${TILE_KIT.sampleCount} real samples pulled for your project, at your door within ${TILE_KIT.turnaroundDays} business days.`,
  },
  {
    icon: Ruler,
    title: 'Pick one, we quote the install',
    body: `Free measure, written quote, and your $${TILE_KIT.price} back as $${TILE_KIT.installCredit} off the job.`,
  },
]

export default function TileSamplesPage() {
  return (
    <div className="bg-white">
      <JsonLd data={faqJsonLd(faqs)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: 'https://aguirremoderntile.com' },
          { name: 'Tile Match Kit', url: 'https://aguirremoderntile.com/tile-samples' },
        ])}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: 'Tile Match Kit',
          description: `${TILE_KIT.sampleCount} hand-picked tile samples delivered across Greater Boston, credited toward your tile installation.`,
          brand: { '@type': 'Brand', name: 'Aguirre Modern Tile' },
          offers: {
            '@type': 'Offer',
            price: String(TILE_KIT.price),
            priceCurrency: 'USD',
            availability: 'https://schema.org/InStock',
            url: 'https://aguirremoderntile.com/tile-samples',
          },
        }}
      />

      {/* Hero + form side by side — the offer and the action never separate. */}
      <section className="bg-gradient-to-b from-primary-50 to-white py-12 lg:py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-primary-100 px-4 py-1.5 text-sm font-semibold text-primary-800">
                <Star className="h-4 w-4 fill-primary-700 text-primary-700" />
                150+ five-star reviews in Greater Boston
              </span>

              <h1 className="mt-5 text-4xl font-bold leading-tight text-gray-900 lg:text-5xl">
                Stop picking tile from photos.
              </h1>

              <p className="mt-4 text-lg text-gray-700">
                Screens lie about color. Get{' '}
                <strong>{TILE_KIT.sampleCount} real tile samples</strong> — hand-picked for your
                room, your style and your budget — delivered to your door in{' '}
                {TILE_KIT.turnaroundDays} business days.
              </p>

              <div className="mt-6 flex items-baseline gap-3">
                <span className="text-4xl font-bold text-gray-900">${TILE_KIT.price}</span>
                <span className="text-lg text-gray-600">
                  — and you get{' '}
                  <strong className="text-primary-700">
                    ${TILE_KIT.installCredit} back
                  </strong>{' '}
                  off your install
                </span>
              </div>

              <ul className="mt-7 space-y-3">
                {[
                  `${TILE_KIT.sampleCount} full samples, yours to keep`,
                  'Grout color card + installed cost-per-sq-ft sheet',
                  'Hand-delivered locally — no shipping, no returns',
                  `$${TILE_KIT.installCredit} credited if you book the install`,
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" strokeWidth={3} />
                    <span className="text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex items-center gap-2 text-sm text-gray-500">
                <ShieldCheck className="h-4 w-4" />
                Licensed &amp; insured · Serving Greater Boston since 2010
              </div>
            </div>

            <TileKitForm />
          </div>
        </div>
      </section>

      <section className="border-t border-gray-100 py-14 lg:py-20">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-center text-3xl font-bold text-gray-900">How it works</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {steps.map((step, i) => (
              <div key={step.title} className="rounded-2xl border border-gray-200 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100">
                  <step.icon className="h-6 w-6 text-primary-700" />
                </div>
                <p className="mt-4 text-sm font-semibold text-primary-700">Step {i + 1}</p>
                <h3 className="mt-1 text-lg font-bold text-gray-900">{step.title}</h3>
                <p className="mt-2 text-gray-600">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The honest math. Homeowners who have shopped tile already know a bad
          material choice costs far more than the kit — say it out loud. */}
      <section className="bg-gray-50 py-14 lg:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-gray-900">
            A ${TILE_KIT.price} kit beats a $5,000 mistake
          </h2>
          <p className="mt-4 text-lg text-gray-700">
            The average bathroom we tile runs a few thousand dollars in labor and material. Picking
            the wrong tile — wrong tone, wrong finish, wrong size for the room — is the single most
            expensive thing a homeowner can get wrong, and it is the one thing a photo cannot tell
            you.
          </p>
          <p className="mt-4 text-lg text-gray-700">
            Hold the samples against your vanity. Look at them at night under your own lights. Then
            decide.
          </p>
          <Link
            href="#kit-form"
            className="mt-8 inline-block rounded-lg bg-primary-600 px-8 py-4 text-lg font-semibold text-white transition hover:bg-primary-700"
          >
            Get my Tile Match Kit — ${TILE_KIT.price}
          </Link>
        </div>
      </section>

      <section className="py-14 lg:py-20">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-center text-3xl font-bold text-gray-900">Questions</h2>
          <dl className="mt-10 space-y-6">
            {faqs.map((faq) => (
              <div key={faq.question} className="rounded-xl border border-gray-200 p-6">
                <dt className="font-semibold text-gray-900">{faq.question}</dt>
                <dd className="mt-2 text-gray-600">{faq.answer}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-12 text-center">
            <p className="text-gray-600">
              Already know what you want?{' '}
              <Link href="/quote/bathroom" className="font-semibold text-primary-700 underline">
                Skip the kit and get a quote
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
