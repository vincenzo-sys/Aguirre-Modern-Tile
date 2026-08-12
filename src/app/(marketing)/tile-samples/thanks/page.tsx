import { Metadata } from 'next'
import Link from 'next/link'
import { Check, Truck, Ruler, MessageSquare } from 'lucide-react'
import { confirmKitPaymentBySessionId } from '@/lib/tileKit'
import { TILE_KIT } from '@/data/tileKit'

export const metadata: Metadata = {
  title: 'Your Tile Match Kit is on the way | Aguirre Modern Tile',
  description: 'Kit confirmed. Here is what happens next.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function TileKitThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; ref?: string }>
}) {
  const { session_id: sessionId } = await searchParams

  // Confirm against Stripe here rather than relying on the webhook: the
  // browser always arrives with the session id, and Stripe is the source of
  // truth. Safe to run alongside the webhook — confirmKitPayment is idempotent.
  let customerName: string | null = null
  if (sessionId) {
    try {
      const result = await confirmKitPaymentBySessionId(sessionId)
      customerName = result?.clientName ?? null
    } catch (err) {
      // Never fail the thank-you page over a confirmation write — the lead
      // already exists and Vince gets the Discord ping either way.
      console.error('[TileKit] confirmation failed:', err)
    }
  }

  const firstName = customerName?.split(' ')[0] ?? ''

  const steps = [
    {
      icon: Check,
      title: 'We pull your samples',
      body: `Vince hand-picks ${TILE_KIT.sampleCount} tiles from local distributor racks based on the styles you chose — not a random assortment.`,
    },
    {
      icon: Truck,
      title: `Delivered in ${TILE_KIT.turnaroundDays} business days`,
      body: 'We drop the kit at your door and text you when it lands. No shipping wait, no return label.',
    },
    {
      icon: Ruler,
      title: 'Free measure + written quote',
      body: `Pick your favorite and we come measure. Your $${TILE_KIT.price} comes back as $${TILE_KIT.installCredit} off the install.`,
    },
  ]

  return (
    <div className="bg-white">
      <section className="bg-gradient-to-b from-primary-50 to-white py-16 lg:py-24">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary-600">
            <Check className="h-8 w-8 text-white" strokeWidth={3} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 lg:text-4xl">
            {firstName ? `You're set, ${firstName}.` : "You're set."}
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Your Tile Match Kit is confirmed. Check your email for the receipt — we&apos;ll text
            you before we drop it off.
          </p>
        </div>
      </section>

      <section className="py-12 lg:py-16">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="mb-8 text-center text-2xl font-bold text-gray-900">What happens next</h2>
          <ol className="space-y-6">
            {steps.map((step, i) => (
              <li key={step.title} className="flex gap-4 rounded-xl border border-gray-200 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100">
                  <step.icon className="h-5 w-5 text-primary-700" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">
                    {i + 1}. {step.title}
                  </p>
                  <p className="mt-1 text-gray-600">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-10 rounded-xl bg-gray-50 p-6 text-center">
            <p className="font-semibold text-gray-900">
              Want the quote started before the kit arrives?
            </p>
            <p className="mt-1 text-gray-600">
              Send photos of the space now and we&apos;ll have numbers ready when you pick a tile.
            </p>
            <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/quote/bathroom"
                className="rounded-lg bg-primary-600 px-6 py-3 font-semibold text-white transition hover:bg-primary-700"
              >
                Send project photos
              </Link>
              <a
                href="tel:+16177661259"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-900 transition hover:bg-gray-100"
              >
                <MessageSquare className="h-4 w-4" />
                (617) 766-1259
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
