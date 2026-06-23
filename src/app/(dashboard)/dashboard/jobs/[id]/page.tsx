import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, User, Ruler, Clock, ImageIcon, DollarSign, CheckCircle2 } from 'lucide-react'
import JobStatusBadge from '@/components/dashboard/JobStatusBadge'
import StatusUpdateDropdown from '@/components/dashboard/StatusUpdateDropdown'
import JobMobileActionBar from '@/components/dashboard/JobMobileActionBar'
import CrewApprovalCard from '@/components/dashboard/CrewApprovalCard'
import CustomerCard from '@/components/dashboard/CustomerCard'
import JobLineItems from '@/components/dashboard/JobLineItems'
import EstimateInvoiceCards from '@/components/dashboard/EstimateInvoiceCards'
import JobEditForm from '@/components/dashboard/JobEditForm'
import CrewLog from '@/components/dashboard/CrewLog'
import LaborLog from '@/components/dashboard/LaborLog'
import UploadJobPhotos from '@/components/dashboard/UploadJobPhotos'
import DepositReceivedAction from '@/components/dashboard/DepositReceivedAction'
import EstimateShareLink from '@/components/dashboard/EstimateShareLink'
import WorkOrderShareLink from '@/components/dashboard/WorkOrderShareLink'
import EstimateTextEditor from '@/components/dashboard/EstimateTextEditor'
import EstimateMessages from '@/components/EstimateMessages'
import GenerateEstimateModal from '@/components/dashboard/GenerateEstimateModal'
import CopyContextButton from '@/components/dashboard/CopyContextButton'
import DeleteJobButton from '@/components/dashboard/DeleteJobButton'
import { templateForJobType } from '@/lib/quoteHints'
import FinalPaymentButton from '@/components/dashboard/FinalPaymentButton'
import { getDemoJob, getDemoCustomer, demoProfile, getDemoInvoicesForJob, demoTeamMembers } from '@/lib/demo'
import { shouldUseDemoData } from '@/lib/useDemoFallback'
import type { Job, JobPhoto, Profile, Invoice, Customer, CrewMember, LaborEntryWithMember } from '@/lib/supabase/types'

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
  let team: Profile[] = []
  let crewMembers: CrewMember[] = []
  let laborEntries: LaborEntryWithMember[] = []

  const useDemo = await shouldUseDemoData()

  if (useDemo) {
    const demoJob = getDemoJob(id)
    if (!demoJob) notFound()
    job = demoJob
    assignee = demoJob.assignee ?? null
    invoices = getDemoInvoicesForJob(id)
    team = demoTeamMembers
    if (job.customer_id) {
      customer = getDemoCustomer(job.customer_id) ?? null
    }
  } else {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      // Fallback to demo if auth failed between middleware and page render
      const demoJob = getDemoJob(id)
      if (!demoJob) notFound()
      job = demoJob
      invoices = getDemoInvoicesForJob(id)
      team = demoTeamMembers
    } else {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      if (profileData) {
        profile = profileData as Profile
        isOwner = profile.role === 'owner'
      }

      const { data: jobData } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', id)
        .single()

      if (!jobData) notFound()
      // Lead-stage jobs (lead/quoted/estimate_revised) belong on the Leads
      // workspace, not here. Redirect rather than render two views of the
      // same record. Once the deal is "Sent to Jobs" (status moves to
      // accepted_not_scheduled), the operations view at this URL is the right
      // surface and the redirect stops firing.
      if (['lead', 'quoted', 'estimate_revised'].includes(jobData.status)) {
        redirect(`/dashboard/leads/${id}`)
      }
      job = { ...jobData, line_items: jobData.line_items ?? [] } as Job

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

      const { data: teamData } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true)
        .order('full_name')
      team = (teamData ?? []) as Profile[]

      const { data: crewData } = await supabase
        .from('crew_members')
        .select('*')
        .eq('is_active', true)
        .order('full_name')
      crewMembers = (crewData ?? []) as CrewMember[]

      const { data: laborData } = await supabase
        .from('labor_entries')
        .select('*, crew_member:crew_members(*)')
        .eq('job_id', id)
        .order('work_date', { ascending: true })
      laborEntries = (laborData ?? []) as LaborEntryWithMember[]

      const { data: photos } = await supabase
        .from('job_photos')
        .select('*')
        .eq('job_id', id)
        .order('created_at', { ascending: true })

      const photoList = (photos ?? []) as JobPhoto[]
      try {
        photosWithUrls = await Promise.all(
          photoList.map(async (photo) => {
            const { data: urlData } = await supabase.storage
              .from('job-photos')
              .createSignedUrl(photo.storage_path, 3600)
            return { ...photo, url: urlData?.signedUrl }
          })
        )
      } catch {
        photosWithUrls = photoList.map((photo) => ({ ...photo, url: undefined }))
      }
    }
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
          <div className="flex items-center gap-2 flex-wrap">
            {isOwner && <DepositReceivedAction job={job} />}
            {(job.status === 'in_progress' || job.status === 'completed' || job.status === 'paid') && (
              <FinalPaymentButton
                jobId={job.id}
                estimatedCost={job.estimated_cost}
                amountPaid={Number(job.amount_paid ?? 0)}
                alreadyReceived={Boolean(job.final_payment_at)}
              />
            )}
            <StatusUpdateDropdown jobId={job.id} currentStatus={job.status} isOwner={isOwner} />
            {isOwner && <JobEditForm job={job} teamMembers={team} />}
            {isOwner && (
              <DeleteJobButton
                jobId={job.id}
                jobNumber={job.job_number}
                jobTitle={job.title}
                amountPaid={Number(job.amount_paid ?? 0)}
              />
            )}
            {isOwner && (
              <Link
                href={`/dashboard/jobs/${job.id}/estimate`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                Estimate
              </Link>
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

        {/* Deposit-paid pill — prominent when the customer has paid the
            deposit, so the moment Vince opens a job he can see the deal
            money has actually moved. Sources `estimate_accepted_at` (set
            by Stripe webhook OR DepositReceivedAction); falls back to
            `updated_at` for legacy rows where amount_paid was set without
            the timestamp. */}
        {job.amount_paid != null && job.amount_paid > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 w-fit">
            <CheckCircle2 className="w-4 h-4 text-green-700" />
            <span className="text-sm font-semibold text-green-900">
              Deposit paid · {formatCurrency(Number(job.amount_paid))}
            </span>
            {(job.estimate_accepted_at || job.updated_at) && (
              <span className="text-xs text-green-700">
                · {formatDate((job.estimate_accepted_at ?? job.updated_at).split('T')[0])}
              </span>
            )}
          </div>
        )}

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
          <CustomerCard customer={customer} job={job} editable={!useDemo} />
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

          {/* Estimate text — warranty + payment terms + payment methods +
              customer-provides. Snapshotted from estimate_defaults at
              estimate-generate time, editable per-job here. Also covers the
              old read-only "Customer is providing" block. */}
          <EstimateTextEditor
            jobId={job.id}
            warrantyText={job.warranty_text ?? null}
            paymentTermsText={job.payment_terms_text ?? null}
            paymentMethods={job.payment_methods ?? null}
            customerProvides={job.customer_provides}
          />

          {/* Crew Instructions — always visible when set */}
          {job.crew_instructions && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-amber-900 uppercase tracking-wider mb-2">
                Instructions for the crew
              </h3>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{job.crew_instructions}</p>
            </div>
          )}

          {/* Scope of Work — also rendered on the customer-facing estimate.
              Label flags this so editors don't mistake it for an internal
              field. */}
          {job.scope_notes && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Scope of work
                </h3>
                <span className="text-[11px] font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded px-2 py-0.5">
                  Shown to customer
                </span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.scope_notes}</p>
            </div>
          )}

          {/* Internal Notes — owner only, collapsed by default */}
          {isOwner && job.notes && (
            <details className="bg-white rounded-xl shadow-sm border border-gray-200 group">
              <summary className="cursor-pointer list-none p-4 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Internal Notes
                </h3>
                <span className="text-xs text-gray-400 group-open:hidden">Show</span>
                <span className="text-xs text-gray-400 hidden group-open:inline">Hide</span>
              </summary>
              <div className="px-4 pb-4 -mt-2">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.notes}</p>
              </div>
            </details>
          )}
        </div>
      </div>

      {/* Estimate share link (owner only) */}
      {isOwner && (
        <div className="mb-6">
          <EstimateShareLink job={job} />
        </div>
      )}

      {/* Crew work order link — public, no pricing. Shown to anyone who can
          view the job so the crew link is always one tap away in the field. */}
      <div className="mb-6">
        <WorkOrderShareLink job={job} />
      </div>

      {/* Customer ↔ Aguirre conversation thread tied to this job's estimate.
          Reads + writes through /api/jobs/[id]/messages; sends SMS + email
          to the customer on Aguirre replies. */}
      {job.estimate_token && (
        <div className="mb-6">
          <EstimateMessages
            mode="aguirre"
            endpoint={`/api/jobs/${job.id}/messages`}
            defaultSenderName={profile?.full_name || 'Vince'}
          />
        </div>
      )}

      {/* Crew approval — owner sees button + status, crew sees pending
          banner with Approve / Needs changes when Vince has requested it. */}
      <CrewApprovalCard
        jobId={job.id}
        isOwner={isOwner}
        status={job.crew_approval_status}
        notes={job.crew_approval_notes}
        requestedAt={job.crew_approval_requested_at}
        approvedAt={job.crew_approved_at}
      />

      {/* Line Items */}
      <div className="mb-6">
        {isOwner && (
          <div className="mb-3 flex items-center justify-end gap-2">
            <CopyContextButton jobId={job.id} size="sm" />
            <GenerateEstimateModal
              jobId={job.id}
              hasExistingItems={Array.isArray(job.line_items) && job.line_items.length > 0}
              estimateSent={!!job.estimate_sent_at}
              initialSqft={job.square_footage}
              initialTemplate={templateForJobType(job.job_type) ?? undefined}
            />
          </div>
        )}
        <JobLineItems items={job.line_items ?? []} jobId={job.id} isOwner={isOwner} />
      </div>

      {/* Estimate + Invoice — owner only, collapsed by default */}
      {isOwner && (
        <details className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 group">
          <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Estimate &amp; Invoice</h3>
            <span className="text-xs text-gray-400 group-open:hidden">Show</span>
            <span className="text-xs text-gray-400 hidden group-open:inline">Hide</span>
          </summary>
          <div className="px-4 pb-4 -mt-2">
            <EstimateInvoiceCards job={job} invoices={invoices} />
          </div>
        </details>
      )}

      {/* Field log — any user can add entries */}
      <div className="mb-6">
        <CrewLog
          jobId={job.id}
          initialLog={job.crew_log}
          authorName={profile.full_name?.split(' ')[0] || 'Crew'}
        />
      </div>

      {/* Labor hours — Vince/Christian log crew time here; crew can also log
          via the work-order link. Cost totals are owner-only. */}
      {!useDemo && (
        <div className="mb-6">
          <LaborLog
            jobId={job.id}
            crewMembers={crewMembers}
            initialEntries={laborEntries}
            isOwner={isOwner}
          />
        </div>
      )}

      {/* Photos — Before */}
      <PhotoSection
        id="photos"
        title="Before photos"
        description={
          isOwner
            ? 'Reference shots Christian uses on site.'
            : 'Reference shots from Vince — use these on site.'
        }
        photos={photosWithUrls.filter(
          (p) => p.photo_type === 'before' || p.photo_type === 'reference'
        )}
        uploadSlot={
          isOwner ? (
            <UploadJobPhotos jobId={job.id} photoType="before" label="Add before photos" />
          ) : null
        }
      />

      {/* Photos — After */}
      <PhotoSection
        title="After photos"
        description="Finished work. Christian uploads these on site."
        photos={photosWithUrls.filter((p) => p.photo_type === 'after')}
        uploadSlot={<UploadJobPhotos jobId={job.id} photoType="after" label="Add after photos" />}
      />

      {/* Mobile-only sticky action bar with the most-likely-next status as
          a thumb-zone primary button. Sits above the bottom tab bar.
          Desktop keeps the existing StatusUpdateDropdown above. */}
      <JobMobileActionBar jobId={job.id} currentStatus={job.status} isOwner={isOwner} />
    </div>
  )
}

function PhotoSection({
  id,
  title,
  description,
  photos,
  uploadSlot,
}: {
  id?: string
  title: string
  description: string
  photos: (JobPhoto & { url?: string })[]
  uploadSlot: React.ReactNode
}) {
  return (
    <div id={id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-gray-500" />
            {title}
            <span className="text-xs font-normal text-gray-400">({photos.length})</span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
        {uploadSlot}
      </div>

      <div className="p-4">
        {photos.length === 0 ? (
          <p className="text-sm text-gray-400 italic text-center py-6">No photos yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {photos.map((photo) => (
              <div key={photo.id}>
                {photo.url ? (
                  <a href={photo.url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.caption || photo.file_name}
                      className="w-full aspect-square object-cover rounded-lg border border-gray-200 hover:border-primary-300 transition-colors"
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
        )}
      </div>
    </div>
  )
}
