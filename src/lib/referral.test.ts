import { describe, it, expect } from 'vitest'
import { decideReferralAttribution, leadSourceFor } from '@/lib/referral'

describe('decideReferralAttribution', () => {
  it('attributes when the code resolves to a different, unattributed customer', () => {
    const d = decideReferralAttribution({
      referralCode: 'abc123',
      customerId: 'cust_new',
      referrerId: 'cust_referrer',
      currentReferredBy: null,
    })
    expect(d).toEqual({ attribute: true, referrerId: 'cust_referrer' })
  })

  it('skips when there is no referral code (organic lead)', () => {
    const d = decideReferralAttribution({
      referralCode: '',
      customerId: 'cust_new',
      referrerId: null,
      currentReferredBy: null,
    })
    expect(d).toEqual({ attribute: false, reason: 'no-code' })
  })

  it('skips when find-or-create produced no customer id', () => {
    const d = decideReferralAttribution({
      referralCode: 'abc123',
      customerId: null,
      referrerId: 'cust_referrer',
      currentReferredBy: null,
    })
    expect(d).toEqual({ attribute: false, reason: 'no-customer' })
  })

  it('skips when the code matches no customer', () => {
    const d = decideReferralAttribution({
      referralCode: 'garbage',
      customerId: 'cust_new',
      referrerId: null,
      currentReferredBy: null,
    })
    expect(d).toEqual({ attribute: false, reason: 'code-not-found' })
  })

  it('blocks self-referral (referrer opened their own link)', () => {
    const d = decideReferralAttribution({
      referralCode: 'abc123',
      customerId: 'cust_same',
      referrerId: 'cust_same',
      currentReferredBy: null,
    })
    expect(d).toEqual({ attribute: false, reason: 'self-referral' })
  })

  it('does not overwrite an existing attribution', () => {
    const d = decideReferralAttribution({
      referralCode: 'abc123',
      customerId: 'cust_new',
      referrerId: 'cust_referrer',
      currentReferredBy: 'cust_someone_else',
    })
    expect(d).toEqual({ attribute: false, reason: 'already-attributed' })
  })

  it('self-referral is checked before the empty-attribution credit path', () => {
    // A referrer re-submitting through their own link with no prior
    // attribution must still be blocked — self-referral wins over the
    // otherwise-attributable case.
    const d = decideReferralAttribution({
      referralCode: 'abc123',
      customerId: 'cust_same',
      referrerId: 'cust_same',
      currentReferredBy: null,
    })
    expect(d.attribute).toBe(false)
  })
})

describe('leadSourceFor', () => {
  it('tags referral leads', () => {
    expect(leadSourceFor('abc123')).toBe('referral')
  })
  it('tags organic leads as website', () => {
    expect(leadSourceFor('')).toBe('website')
  })
})
