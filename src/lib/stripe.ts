import Stripe from 'stripe'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

let stripeInstance: Stripe | null = null

export function getStripe(): Stripe {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }
  if (!stripeInstance) {
    stripeInstance = new Stripe(STRIPE_SECRET_KEY, {
      typescript: true,
    })
  }
  return stripeInstance
}

export function isStripeConfigured(): boolean {
  return !!STRIPE_SECRET_KEY
}
