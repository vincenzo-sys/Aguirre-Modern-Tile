import Stripe from 'stripe'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

let stripeInstance: Stripe | null = null

export function getStripe(): Stripe {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }
  if (!stripeInstance) {
    // Use Node's native HTTP client instead of fetch to avoid
    // connection issues in Vercel's serverless environment
    const { NodeHttpClient } = require('stripe/cjs/net/NodeHttpClient.js')

    stripeInstance = new Stripe(STRIPE_SECRET_KEY, {
      typescript: true,
      maxNetworkRetries: 3,
      timeout: 30000,
      httpClient: new NodeHttpClient(),
    })
  }
  return stripeInstance
}

export function isStripeConfigured(): boolean {
  return !!STRIPE_SECRET_KEY
}
