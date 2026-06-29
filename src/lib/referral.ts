// Referral attribution decision logic, kept pure and I/O-free so it can be
// unit-tested without standing up Supabase. The /api/quotes route does the
// DB reads (look up the referrer by code, read the new customer's existing
// attribution) and passes the results here; this function only decides
// whether — and to whom — attribution should be written.

export type ReferralDecision =
  | { attribute: false; reason: ReferralSkipReason }
  | { attribute: true; referrerId: string }

export type ReferralSkipReason =
  | 'no-code'            // lead didn't come through a /refer/<code> link
  | 'no-customer'        // customer find-or-create produced no id
  | 'code-not-found'     // code didn't resolve to any customer
  | 'self-referral'      // referrer opened their own link
  | 'already-attributed' // this customer already credits someone

export interface ReferralAttributionInput {
  referralCode: string
  customerId: string | null
  /** Customer whose referral_code matched, or null if the code resolved to nobody. */
  referrerId: string | null
  /** The new customer's existing referred_by_customer_id, if any. */
  currentReferredBy: string | null
}

// The order of these guards mirrors the cost of the work that produced each
// input: cheap string checks first, then the results of the two DB lookups.
export function decideReferralAttribution(input: ReferralAttributionInput): ReferralDecision {
  const { referralCode, customerId, referrerId, currentReferredBy } = input

  if (!referralCode) return { attribute: false, reason: 'no-code' }
  if (!customerId) return { attribute: false, reason: 'no-customer' }
  if (!referrerId) return { attribute: false, reason: 'code-not-found' }
  if (referrerId === customerId) return { attribute: false, reason: 'self-referral' }
  if (currentReferredBy) return { attribute: false, reason: 'already-attributed' }

  return { attribute: true, referrerId }
}

// A lead that arrives with a referral code is sourced 'referral'; otherwise it's
// an organic 'website' lead. Kept here next to the decision so the two stay in
// sync if the source taxonomy ever grows.
export function leadSourceFor(referralCode: string): 'referral' | 'website' {
  return referralCode ? 'referral' : 'website'
}
