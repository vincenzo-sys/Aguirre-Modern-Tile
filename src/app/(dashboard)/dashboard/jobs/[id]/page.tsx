import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, User, Ruler, Clock, ImageIcon, DollarSign } from 'lucide-react'
import JobStatusBadge from '@/components/dashboard/JobStatusBadge'
import StatusUpdateDropdown from '@/components/dashboard/StatusUpdateDropdown'
import CustomerCard from '@/components/dashboard/CustomerCard'
import JobLineItems from '@/components/dashboard/JobLineItems'
import EstimateInvoiceCards from '@/components/dashboard/EstimateInvoiceCards'
import { getDemoJob, getDemoCustomer, demoProfile, getDemoInvoicesForJob } from '@/lib/demo'
import { shouldUseDemoData } from '@/lib/useDemoFallback'
import type { Job, JobPhoto, Profile, Invoice, Customer } from '@/lib/supabase/types'

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount)
}

const paymentStatusColors: Record<string, string> = {
  unpaid: 'bg-gray-100 text-gray-600',
  partial: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let job: Job
  let assignee: Profile | null = null
  let customer: Customer | null = null
  let photosWithUrls: (JobPhoto & { url?: string })[] = []
  let isOwner = true
  let profile: Profile = demoProfile
  let invoices: Invoice[] = []

  const useDemo = await shouldUseDemoData()

  if (useDemo) {
    const demoJob = getDemoJob(id)
    if (!demoJob) notFound()
    job = demoJob
    assignee = demoJob.assignee ?? null
    invoices = getDemoInvoicesForJob(id)
    if (job.customer_id) {
      customer = getDemoCustomer(job.customer_id) ?? null
    }
  } else {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user!.id)
      .single()
    profile = profileData as Profile
    isOwner = profile.role === 'owner'

    const { data: jobData } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .single()

    if (!jobData) notFound()
    job = jobData as Job

    // Fetch related data in parallel
    if (job.assigned_to) {
      const { data } = await supabase.from('profiles').select('*').eq('id', job.assigned_to).single()
      assignee = data as Profile | null
    }

    if (job.customer_id) {
      const { data } = await supabase.from('customers').select('*').eq('id', job.customer_id).single()
      customer = data as Customer | null
    }

    const { data: invData } = await supabase
      .from('invoices')
      .select('*')
      .eq('job_id', id)
      .order('created_at', { ascending: true })
    invoices = (invData ?? []) as Invoice[]

    const { data: photos } = await supabase
      .from('job_photos')
      .select('*')
      .eq('job_id', id)
      .order('created_at', { ascending: true })

    const photoList = (photos ?? []) as JobPhoto[]
    photosWithUrls = await Promise.all(
      photoList.map(async (photo) => {
        const { data: urlData } = await supabase.storage
          .from('job-photos')
          .createSignedUrl(photo.storage_path, 3600)
        return { ...photo, url: urlData?.signedUrl }
      })
    )
  }

  // Calculate payment status
  const amountPaid = job.amount_paid ?? 0
  const amountInvoiced = job.amount_invoiced ?? 0
  const paymentStatus = amountPaid >= amountInvoiced && amountInvoiced > 0
    ? 'paid'
    : amountPaid > 0
    ? 'partial'
    : 'unpaid'

  return (
    <div>
      {/* Back link */}
      <Link
        href="/dashboard/jobs"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Jobs
      </Link>

      {useDemo && (
        <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 p-3">
          <p className="text-sm text-amber-800">
            <strong>Demo Mode</strong> — Viewing sample data.
          </p>
        </div>
      )}

      {/* Header — like ShopPilot's job detail header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <JobStatusBadge status={job.status} />
              <span className="text-sm text-gray-400 font-mono">#{job.job_number}</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            {!isOwner && job.assigned_to === profile.id && (
              <StatusUpdateDropdown jobId={job.id} currentStatus={job.status} />
            )}
            {isOwner && (
              <Link
                href={`/dashboard/invoices/new?job=${job.id}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
              >
                Create Invoice
              </Link>
            )}
          </div>
        </div>

        {/* Metadata row — like ShopPilot */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4 mt-6 pt-4 border-t border-gray-100">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</p>
            <p className="text-sm text-gray-900 mt-0.5">{formatDate(job.created_at.split('T')[0])}</p>
          </div>
          {job.scheduled_start && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Scheduled</p>
              <p className="text-sm text-gray-900 mt-0.5">{formatDate(job.scheduled_start)}</p>
            </div>
          )}
          {assignee && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Assigned</p>
              <p className="text-sm text-gray-900 mt-0.5">{assignee.full_name}</p>
            </div>
          )}
          {job.square_footage && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Area</p>
              <p className="text-sm text-gray-900 mt-0.5">{job.square_footage} sq ft</p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Payment</p>
            <span className={`inline-flex items-center mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${paymentStatusColors[paymentStatus]}`}>
              {paymentStatus}{amountPaid > 0 ? ` · ${formatCurrency(amountPaid)}` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Customer Card + Details side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-1">
          <CustomerCard customer={customer} job={job} />
        </div>
        <div className="lg:col-span-2 space-y-4">
          {/* Job Details */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Job Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {job.job_type && (
                <div>
                  <span className="text-gray-500">Type:</span>
                  <span className="ml-2 text-gray-900 font-medium">{job.job_type}</span>
                </div>
              )}
              {job.estimated_days && (
                <div>
                  <span className="text-gray-500">Est. Days:</span>
                  <span className="ml-2 text-gray-900 font-medium">{job.estimated_days}</span>
                  {job.actual_days && (
                    <span className="text-gray-400 ml-1">(actual: {job.actual_days})</span>
                  )}
                </div>
              )}
              {job.estimated_cost && (
                <div>
                  <span className="text-gray-500">Est. Cost:</span>
                  <span className="ml-2 text-gray-900 font-medium">{formatCurrency(job.estimated_cost)}</span>
                  {job.actual_cost && (
                    <span className="text-gray-400 ml-1">(actual: {formatCurrency(job.actual_cost)})</span>
                  )}
                </div>
              )}
              {job.scheduled_start && job.scheduled_end && (
                <div>
                  <span className="text-gray-500">Schedule:</span>
                  <span className="ml-2 text-gray-900 font-medium">
                    {formatDate(job.scheduled_start)} — {formatDate(job.scheduled_end)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Scope of Work */}
          {job.scope_notes && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Scope of Work</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.scope_notes}</p>
            </div>
          )}

          {/* Internal Notes */}
          {job.notes && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Internal Notes</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Line Items */}
      <div className="mb-6">
        <JobLineItems items={job.line_items ?? []} />
      </div>

      {/* Estimate + Invoice Cards side by side */}
      <div className="mb-6">
        <EstimateInvoiceCards job={job} invoices={invoices} />
      </div>

      {/* Photos */}
      {photosWithUrls.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="px-4 py-3 bg-gray-800">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <ImageIcon className="w-4 h-4" />
              Photos ({photosWithUrls.length})
            </h3>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {photosWithUrls.map((photo) => (
                <div key={photo.id} className="group">
                  {photo.url ? (
                    <a href={photo.url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt={photo.caption || photo.file_name}
                        className="w-full aspect-square object-cover rounded-lg border border-gray-200 group-hover:border-primary-300 transition-colors"
                      />
                    </a>
                  ) : (
                    <div className="w-full aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  {photo.caption && (
                    <p className="text-xs text-gray-500 mt-1 truncate">{photo.caption}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
