import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Phone, Mail, MapPin, Calendar, User, Ruler, Clock, ImageIcon } from 'lucide-react'
import JobStatusBadge from '@/components/dashboard/JobStatusBadge'
import FinancialsCard from '@/components/dashboard/FinancialsCard'
import JobPerformance from '@/components/dashboard/JobPerformance'
import JobInvoiceList from '@/components/dashboard/JobInvoiceList'
import StatusUpdateDropdown from '@/components/dashboard/StatusUpdateDropdown'
import { isDemoMode, getDemoJob, demoProfile, getDemoInvoicesForJob } from '@/lib/demo'
import type { Job, JobPhoto, Profile, Invoice } from '@/lib/supabase/types'

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let job: Job
  let assignee: Profile | null = null
  let creator: Profile | null = null
  let photosWithUrls: (JobPhoto & { url?: string })[] = []
  let isOwner = true
  let profile: Profile = demoProfile
  let invoices: Invoice[] = []

  if (isDemoMode) {
    const demoJob = getDemoJob(id)
    if (!demoJob) notFound()
    job = demoJob
    assignee = demoJob.assignee ?? null
    creator = demoProfile
    invoices = getDemoInvoicesForJob(id)
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

    if (job.assigned_to) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', job.assigned_to)
        .single()
      assignee = data as Profile | null
    }

    if (job.created_by) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', job.created_by)
        .single()
      creator = data as Profile | null
    }

    const { data: photos } = await supabase
      .from('job_photos')
      .select('*')
      .eq('job_id', id)
      .order('created_at', { ascending: true })

    const photoList = (photos ?? []) as JobPhoto[]

    photosWithUrls = await Promise.all(
      photoList.map(async (photo) => {
        const { data } = await supabase.storage
          .from('job-photos')
          .createSignedUrl(photo.storage_path, 3600)
        return { ...photo, url: data?.signedUrl }
      })
    )

    const { data: invData } = await supabase
      .from('invoices')
      .select('*')
      .eq('job_id', id)
      .order('created_at', { ascending: true })
    invoices = (invData ?? []) as Invoice[]
  }

  return (
    <div>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to jobs
      </Link>

      {isDemoMode && (
        <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 p-3">
          <p className="text-sm text-amber-800">
            <strong>Demo Mode</strong> — Viewing sample data.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-sm text-gray-500 font-mono">#{job.job_number}</span>
              <JobStatusBadge status={job.status} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
          </div>
          {!isOwner && job.assigned_to === profile.id && (
            <StatusUpdateDropdown jobId={job.id} currentStatus={job.status} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Client Info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Client</h2>
          <div className="space-y-3">
            <p className="font-medium text-gray-900">{job.client_name}</p>
            {job.client_phone && (
              <a
                href={`tel:${job.client_phone}`}
                className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700"
              >
                <Phone className="w-4 h-4" />
                {job.client_phone}
              </a>
            )}
            {job.client_email && (
              <a
                href={`mailto:${job.client_email}`}
                className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700"
              >
                <Mail className="w-4 h-4" />
                {job.client_email}
              </a>
            )}
            {job.client_address && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(job.client_address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700"
              >
                <MapPin className="w-4 h-4 shrink-0" />
                {job.client_address}
              </a>
            )}
          </div>
        </div>

        {/* Job Details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>
          <dl className="space-y-3">
            {job.job_type && (
              <div className="flex items-center gap-2">
                <dt className="text-sm text-gray-500 w-32">Type</dt>
                <dd className="text-sm text-gray-900">{job.job_type}</dd>
              </div>
            )}
            {job.square_footage && (
              <div className="flex items-center gap-2">
                <dt className="text-sm text-gray-500 w-32 flex items-center gap-1.5">
                  <Ruler className="w-4 h-4" />Sq Ft
                </dt>
                <dd className="text-sm text-gray-900">{job.square_footage}</dd>
              </div>
            )}
            {job.estimated_days && (
              <div className="flex items-center gap-2">
                <dt className="text-sm text-gray-500 w-32 flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />Est. Days
                </dt>
                <dd className="text-sm text-gray-900">{job.estimated_days}</dd>
              </div>
            )}
            {job.scheduled_start && (
              <div className="flex items-center gap-2">
                <dt className="text-sm text-gray-500 w-32 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />Start
                </dt>
                <dd className="text-sm text-gray-900">
                  {new Date(job.scheduled_start + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </dd>
              </div>
            )}
            {job.scheduled_end && (
              <div className="flex items-center gap-2">
                <dt className="text-sm text-gray-500 w-32 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />End
                </dt>
                <dd className="text-sm text-gray-900">
                  {new Date(job.scheduled_end + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </dd>
              </div>
            )}
            {assignee && (
              <div className="flex items-center gap-2">
                <dt className="text-sm text-gray-500 w-32 flex items-center gap-1.5">
                  <User className="w-4 h-4" />Assigned to
                </dt>
                <dd className="text-sm text-gray-900">{assignee.full_name}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Financials */}
        <FinancialsCard job={job} />

        {/* Performance */}
        <JobPerformance job={job} />

        {/* Scope Notes */}
        {job.scope_notes && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Scope of Work</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.scope_notes}</p>
          </div>
        )}

        {/* Internal Notes */}
        {job.notes && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Internal Notes</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.notes}</p>
          </div>
        )}
      </div>

      {/* Invoices */}
      <div className="mt-6">
        <JobInvoiceList invoices={invoices} jobId={job.id} isOwner={isOwner} />
      </div>

      {/* Photos */}
      {photosWithUrls.length > 0 && (
        <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Photos ({photosWithUrls.length})
          </h2>
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
      )}

      {/* Meta */}
      <div className="mt-6 text-xs text-gray-400 space-y-1">
        {creator && <p>Created by {creator.full_name}</p>}
        <p>Created {new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
        <p>Updated {new Date(job.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
      </div>
    </div>
  )
}
