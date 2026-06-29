'use client'

import { useEffect } from 'react'

// Persists the referral code so it survives the navigation from /refer/<code>
// → homepage lead form → /quote/<type>, where ProjectQuoteForm reads it back
// and sends it with the quote so /api/quotes can set referred_by_customer_id.
export default function StoreReferral({ code }: { code: string }) {
  useEffect(() => {
    try {
      localStorage.setItem('referralCode', code)
    } catch {
      // private mode / storage disabled — attribution just won't apply.
    }
  }, [code])
  return null
}
