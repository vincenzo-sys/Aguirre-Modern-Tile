import { Phone, MessageSquare } from 'lucide-react'

// Shown when an estimate token doesn't resolve (expired, revoked, or mistyped
// link). A customer who taps a stale link should never hit the generic site
// 404 — that reads like they did something wrong. Instead, reassure them and
// put us one tap away. Mirrors the CTA styling used elsewhere in the customer
// flow (PhotoUploadForm, the estimate page itself).
const COMPANY_PHONE = '(617) 766-1259'
const COMPANY_PHONE_TEL = '+16177661259'
const SMS_HREF = `sms:${COMPANY_PHONE_TEL}?&body=${encodeURIComponent(
  "Hi Vince — my estimate link isn't working. Can you resend it?"
)}`

export default function EstimateNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md w-full">
        <h1 className="text-2xl font-semibold text-gray-900 mb-3">
          This estimate link isn&apos;t active
        </h1>
        <p className="text-gray-600 mb-8">
          The link may have expired or been updated. Call or text us and
          we&apos;ll send your estimate over right away — no problem at all.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={`tel:${COMPANY_PHONE_TEL}`}
            className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 active:scale-95 transition"
          >
            <Phone className="w-5 h-5" />
            Call {COMPANY_PHONE}
          </a>
          <a
            href={SMS_HREF}
            className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 bg-white text-primary-700 border-2 border-primary-600 rounded-lg font-semibold hover:bg-primary-50 active:scale-95 transition"
          >
            <MessageSquare className="w-5 h-5" />
            Text us
          </a>
        </div>
      </div>
    </div>
  )
}
