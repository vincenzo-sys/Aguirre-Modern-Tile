import Link from 'next/link'
import { Phone, Mail, MessageSquare, MapPin, ExternalLink } from 'lucide-react'
import type { Customer, Job } from '@/lib/supabase/types'

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function CustomerCard({
  customer,
  job,
}: {
  customer?: Customer | null
  job: Job
}) {
  // Use customer data if available, fall back to job's client_* fields
  const name = customer?.name ?? job.client_name
  const phone = customer?.phone ?? job.client_phone
  const email = customer?.email ?? job.client_email
  const address = customer
    ? [customer.address, customer.city, customer.state].filter(Boolean).join(', ') + (customer.zip ? ` ${customer.zip}` : '')
    : job.client_address

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Customer</h3>
        {customer && (
          <Link
            href={`/dashboard/customers/${customer.id}`}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </Link>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-lg font-bold shrink-0">
            {getInitials(name)}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{name}</p>
            {phone && <p className="text-sm text-gray-500">{phone}</p>}
            {email && (
              <a href={`mailto:${email}`} className="text-sm text-primary-600 hover:text-primary-700">
                {email}
              </a>
            )}
          </div>
        </div>

        {address && (
          <p className="text-sm text-gray-500 flex items-center gap-1 mb-4">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            {address}
          </p>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          {phone && (
            <>
              <a
                href={`tel:${phone}`}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                <Phone className="w-4 h-4" />
                Call
              </a>
              <a
                href={`sms:${phone}`}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                <MessageSquare className="w-4 h-4" />
                Text
              </a>
            </>
          )}
          {email && (
            <a
              href={`mailto:${email}`}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              <Mail className="w-4 h-4" />
              Email
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
