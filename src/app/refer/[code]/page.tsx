import type { Metadata } from 'next'
import Link from 'next/link'
import { Star, ShieldCheck, Gift, Phone, Check } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/service'
import StoreReferral from './StoreReferral'

export const metadata: Metadata = {
  title: "You've been referred | Aguirre Modern Tile",
  description:
    'A friend referred you to Aguirre Modern Tile. Get a free tile estimate — you both get $100 toward your projects when you book.',
  robots: { index: false }, // personal referral links shouldn't be indexed
}

const REWARD = '$100'

async function getReferrerFirstName(code: string): Promise<string | null> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('customers')
      .select('name')
      .eq('referral_code', code)
      .single()
    if (!data?.name) return null
    return data.name.trim().split(/\s+/)[0] || null
  } catch {
    return null
  }
}

export default async function ReferralLandingPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const referrerFirstName = await getReferrerFirstName(code)

  return (
    <>
      {/* Persist the code for attribution at quote-submit time. */}
      <StoreReferral code={code} />

      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 to-primary-900 text-white section-padding">
        <div className="container-custom">
          <div className="max-w-2xl mx-auto text-center">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-primary-200 text-sm font-medium mb-6">
              <Gift className="w-4 h-4" />
              You both get {REWARD}
            </span>
            <h1 className="heading-primary text-white mb-5">
              {referrerFirstName
                ? `${referrerFirstName} thinks you'll love Aguirre Modern Tile`
                : "You've been referred to Aguirre Modern Tile"}
            </h1>
            <p className="text-xl text-gray-300 mb-8">
              Greater Boston&apos;s tile specialists — bathrooms, showers, floors &amp; backsplashes.
              Book a job and <strong className="text-white">you both get {REWARD}</strong> toward your projects.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/" className="btn-cta">
                Get My Free Estimate
              </Link>
              <a
                href="tel:6177661259"
                className="btn-outline-white inline-flex items-center justify-center gap-2"
              >
                <Phone className="w-5 h-5" />
                (617) 766-1259
              </a>
            </div>
            <div className="flex items-center justify-center gap-4 mt-6 text-sm text-gray-300">
              <span className="inline-flex items-center gap-1.5">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                4.9 · 150+ reviews
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                Licensed &amp; Insured
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* How the referral works */}
      <section className="section-padding">
        <div className="container-custom max-w-4xl">
          <h2 className="heading-secondary text-center mb-10">How it works</h2>
          <ol className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { n: '1', t: 'Get your free estimate', d: 'Send a few photos or book an in-home visit. Same-day written estimate.' },
              { n: '2', t: 'Book your tile project', d: 'Reserve your install date with a 10% deposit, secured by Stripe.' },
              { n: '3', t: `You both get ${REWARD}`, d: `${referrerFirstName || 'Your friend'} and you each get ${REWARD} toward your projects once your job is booked.` },
            ].map((step) => (
              <li key={step.n} className="bg-white rounded-xl border border-gray-200 p-6 text-center shadow-sm">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary-100 text-primary-700 font-bold mb-3">
                  {step.n}
                </div>
                <h3 className="font-bold text-gray-900 mb-1">{step.t}</h3>
                <p className="text-sm text-gray-600">{step.d}</p>
              </li>
            ))}
          </ol>

          <ul className="mt-10 max-w-xl mx-auto space-y-2 text-gray-700">
            {[
              'Free, no-obligation estimates',
              '15+ years, 220+ bathrooms a year',
              'Waterproofing done right — 2-year workmanship warranty',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <Check className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <div className="text-center mt-10">
            <Link href="/" className="btn-primary">
              Get My Free Estimate
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
