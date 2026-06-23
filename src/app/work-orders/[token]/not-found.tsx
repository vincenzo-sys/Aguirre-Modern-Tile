import { Phone, MessageSquare } from 'lucide-react'

// Shown when a work-order token doesn't resolve (expired, regenerated, or
// mistyped link). Crew in the field should never hit the generic site 404 —
// give them a dead-simple "text Vince for a fresh link" path. Mirrors the
// sticky contact bar styling on the work-order page itself.
const COMPANY_PHONE = '(617) 766-1259'
const COMPANY_PHONE_TEL = '+16177661259'
const SMS_HREF = `sms:${COMPANY_PHONE_TEL}?&body=${encodeURIComponent(
  'Hey Vince — this work order link isn\'t working. Can you send a new one?'
)}`

export default function WorkOrderNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md w-full">
        <h1 className="text-2xl font-semibold text-gray-900 mb-3">
          This work order link isn&apos;t active
        </h1>
        <p className="text-gray-600 mb-8">
          The link may have expired or been replaced. Text Vince and he&apos;ll
          send you a fresh one.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={SMS_HREF}
            className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 active:scale-95 transition"
          >
            <MessageSquare className="w-5 h-5" />
            Text Vince
          </a>
          <a
            href={`tel:${COMPANY_PHONE_TEL}`}
            className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-800 active:scale-95 transition"
          >
            <Phone className="w-5 h-5" />
            Call {COMPANY_PHONE}
          </a>
        </div>
      </div>
    </div>
  )
}
