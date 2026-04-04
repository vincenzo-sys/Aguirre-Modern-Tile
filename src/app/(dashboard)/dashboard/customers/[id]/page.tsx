import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Phone, Mail, MessageSquare, MapPin, Briefcase, FileText, DollarSign, Calendar, Inbox } from 'lucide-react'
import { getDemoCustomer, demoJobs, demoInvoices } from '@/lib/demo'
import { shouldUseDemoData } from '@/lib/useDemoFallback'
import type { Customer, Job, Invoice, QuoteRequest } from '@/lib/supabase/types'

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount)
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const statusColors: Record<string, string> = {
  lead: 'bg-gray-100 text-gray-600',
  quoted: 'bg-blue-100 text-blue-700',
  scheduled: 'bg-indigo-100 text-indigo-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  paid: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-600',
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  overdue: 'bg-red-100 text-red-600',
  void: 'bg-gray-100 text-gray-400',
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let customer: Customer
  let jobs: Job[] = []
  let invoices: Invoice[] = []
  let quotes: QuoteRequest[] = []

  const useDemo = await shouldUseDemoData()

  if (useDemo) {
    const demoCustomer = getDemoCustomer(id)
    if (!demoCustomer) notFound()
    customer = demoCustomer
    jobs = demoJobs.filter((j) => j.customer_id === id)
    invoices = demoInvoices.filter((inv) => inv.customer_id === id)
  } else {
    const { createClient: createSupabase } = await import('@supabase/supabase-js')
    const supabase = createSupabase(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: custData, error: custError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single()

    if (custError || !custData) {
      console.error('Customer fetch error:', custError?.message, 'id:', id)
      notFound()
    }
    customer = custData as Customer

    const { data: jobsData } = await supabase
      .from('jobs')
      .select('*')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
    jobs = (jobsData ?? []) as Job[]

    const { data: invData } = await supabase
      .from('invoices')
      .select('*')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
    invoices = (invData ?? []) as Invoice[]

    // quote_requests may not have customer_id column yet — don't crash
    try {
      const { data: quotesData } = await supabase
        .from('quote_requests')
        .select('*')
        .eq('customer_id', id)
        .order('created_at', { ascending: false })
      quotes = (quotesData ?? []) as QuoteRequest[]
    } catch {
      quotes = []
    }
  }

  const totalRevenue = invoices
    .filter((inv) => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.amount, 0)

  const avgJobValue = jobs.length > 0 ? totalRevenue / jobs.length : 0

  return (
    <div>
      {/* Back link */}
      <Link
        href="/dashboard/customers"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Customers
      </Link>

      {/* Customer Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xl font-bold shrink-0">
            {getInitials(customer.name)}
          </div>
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                customer.source === 'website' ? 'bg-blue-100 text-blue-700' :
                customer.source === 'referral' ? 'bg-green-100 text-green-700' :
                customer.source === 'repeat' ? 'bg-purple-100 text-purple-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {customer.source}
              </span>
            </div>
            {customer.address && (
              <p className="text-sm text-gray-500 flex items-center gap-1 mb-3">
                <MapPin className="w-3.5 h-3.5" />
                {customer.address}{customer.city ? `, ${customer.city}` : ''}{customer.state ? `, ${customer.state}` : ''} {customer.zip ?? ''}
              </p>
            )}
            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {customer.phone && (
                <>
                  <a
                    href={`tel:${customer.phone}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                  >
                    <Phone className="w-4 h-4" />
                    Call {customer.phone}
                  </a>
                  <a
                    href={`sms:${customer.phone}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Text
                  </a>
                </>
              )}
              {customer.email && (
                <a
                  href={`mailto:${customer.email}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                >
                  <Mail className="w-4 h-4" />
                  Email
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">
            <Briefcase className="w-3.5 h-3.5" />
            Total Jobs
          </div>
          <p className="text-2xl font-bold text-gray-900">{jobs.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">
            <DollarSign className="w-3.5 h-3.5" />
            Total Revenue
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">
            <DollarSign className="w-3.5 h-3.5" />
            Avg Job Value
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(avgJobValue)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">
            <Calendar className="w-3.5 h-3.5" />
            Customer Since
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatDate(customer.created_at)}</p>
        </div>
      </div>

      {/* Notes */}
      {customer.notes && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes</h3>
          <p className="text-sm text-gray-700">{customer.notes}</p>
        </div>
      )}

      {/* Jobs Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-800">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            Jobs ({jobs.length})
          </h3>
        </div>
        {jobs.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No jobs yet</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={`/dashboard/jobs/${job.id}`}
                className="block px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{job.title}</p>
                    <p className="text-xs text-gray-500">
                      #{job.job_number} &middot; {job.job_type ?? 'General'} &middot; {job.square_footage ? `${job.square_footage} sq ft` : '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {job.estimated_cost && (
                      <span className="text-sm font-medium text-gray-700">{formatCurrency(job.estimated_cost)}</span>
                    )}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[job.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {job.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Invoices Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-800">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Invoices ({invoices.length})
          </h3>
        </div>
        {invoices.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No invoices yet</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {invoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/dashboard/invoices/${inv.id}`}
                className="block px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{inv.invoice_number}</p>
                    <p className="text-xs text-gray-500">Due {formatDate(inv.due_date)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-900">{formatCurrency(inv.amount)}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {inv.status}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quotes Section */}
      {quotes.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-800">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Inbox className="w-4 h-4" />
              Quote Requests ({quotes.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {quotes.map((q) => (
              <div key={q.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900 text-sm capitalize">{q.project_type.replace('-', ' ')}</p>
                    <p className="text-xs text-gray-500">{formatDate(q.created_at)}</p>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[q.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {q.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
