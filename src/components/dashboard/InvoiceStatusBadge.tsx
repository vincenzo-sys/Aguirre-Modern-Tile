import type { InvoiceStatus } from '@/lib/supabase/types'

const statusConfig: Record<InvoiceStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-800' },
  sent: { label: 'Sent', className: 'bg-blue-100 text-blue-800' },
  paid: { label: 'Paid', className: 'bg-green-100 text-green-800' },
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-800' },
}

export default function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const config = statusConfig[status]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
