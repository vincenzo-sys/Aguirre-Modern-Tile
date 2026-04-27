'use client'

import { useEffect, useState, use, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ArrowRight, Phone, Mail, User, Calendar, Tag, Save, Archive,
  CheckCircle, MapPin, ImageIcon, Sparkles, Loader2, Send, Copy, Check,
  ExternalLink, FileText, Trash2,
} from 'lucide-react'
import { toast } from '@/components/Toast'
import CopyContextButton from '@/components/dashboard/CopyContextButton'
import GenerateEstimateModal from '@/components/dashboard/GenerateEstimateModal'
import JobLineItems from '@/components/dashboard/JobLineItems'
import type { Job, QuoteRequest, QuoteRequestPhoto, QuoteRequestStatus } from '@/lib/supabase/types'

const statusColors: Record<QuoteRequestStatus, string> = {
  new: 'bg-blue-100 text-blue-700',
  reviewed: 'bg-yellow-100 text-yellow-700',
  converted: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-500',
}

const jobStatusColors: Record<string, string> = {
  lead: 'bg-yellow-100 text-yellow-800',
  quoted: 'bg-purple-100 text-purple-800',
  estimate_revised: 'bg-pink-100 text-pink-800',
}

const sources = [
  { value: 'website', label: 'Website' },
  { value: 'phone', label: 'Phone call' },
  { value: 'referral', label: 'Referral' },
  { value: 'walk-in', label: 'Walk-in' },
  { value: 'repeat', label: 'Repeat customer' },
  { value: 'other', label: 'Other' },
]

const LEAD_STAGE_STATUSES = ['lead', 'quoted', 'estimate_revised']

export default function LeadWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  // Either or both can be set: a quote_request might have a converted job;
  // a job might have a source quote_request. Loading logic resolves both.
  const [lead, setLead] = useState<QuoteRequest | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [photos, setPhotos] = useState<QuoteRequestPhoto[]>([])
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [copyingUrl, setCopyingUrl] = useState(false)
  const [generatingLink, setGeneratingLink] = useState(false)
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null)

  // Editable form state
  const [notes, setNotes] = useState('')
  const [nextFollowUp, setNextFollowUp] = useState('')
  const [source, setSource] = useState<string>('website')
  const [lostReason, setLostReason] = useState('')
  const [siteVisitAt, setSiteVisitAt] = useState('')
  const [siteVisitNotes, setSiteVisitNotes] = useState('')
  const [scopeNotes, setScopeNotes] = useState('')
  const [estimateUrl, setEstimateUrl] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      // Try as a quote_request first; fall back to job
      const leadRes = await fetch(`/api/leads/${id}`)
      let leadData: QuoteRequest | null = null
      let jobData: Job | null = null

      if (leadRes.ok) {
        leadData = (await leadRes.json()) as QuoteRequest
        if (leadData.converted_job_id) {
          const jobRes = await fetch(`/api/jobs/${leadData.converted_job_id}`)
          if (jobRes.ok) jobData = (await jobRes.json()) as Job
        }
        const photoRes = await fetch(`/api/quotes/${id}/photos`)
        if (photoRes.ok) {
          const list = (await photoRes.json()) as QuoteRequestPhoto[]
          setPhotos(Array.isArray(list) ? list : [])
        }
      } else {
        const jobRes = await fetch(`/api/jobs/${id}`)
        if (jobRes.ok) {
          jobData = (await jobRes.json()) as Job
          // If the job is past lead-stage, redirect to the operations view
          if (!LEAD_STAGE_STATUSES.includes(jobData.status)) {
            router.replace(`/dashboard/jobs/${id}`)
            return
          }
          // Try to find the source quote_request for this job
          const sourceRes = await fetch(`/api/leads?converted_job_id=${id}`)
          if (sourceRes.ok) {
            const list = await sourceRes.json()
            if (Array.isArray(list) && list.length > 0) {
              leadData = list[0] as QuoteRequest
              const photoRes = await fetch(`/api/quotes/${leadData.id}/photos`)
              if (photoRes.ok) {
                const photoList = (await photoRes.json()) as QuoteRequestPhoto[]
                setPhotos(Array.isArray(photoList) ? photoList : [])
              }
            }
          }
        }
      }

      if (!leadData && !jobData) {
        toast('Lead not found', 'error')
        setLoading(false)
        return
      }

      // For job-only leads (no source quote_request), photos attach to the
      // job via /api/jobs/[id]/photos. Lead-with-QR records loaded their
      // photos above; this fills in the gap for the no-QR case.
      if (!leadData && jobData) {
        const photoRes = await fetch(`/api/jobs/${jobData.id}/photos`)
        if (photoRes.ok) {
          const list = (await photoRes.json()) as QuoteRequestPhoto[]
          setPhotos(Array.isArray(list) ? list : [])
        }
      }

      setLead(leadData)
      setJob(jobData)

      if (leadData) {
        setNotes(leadData.notes ?? '')
        setNextFollowUp(leadData.next_follow_up ?? '')
        setSource(leadData.source ?? 'website')
        setLostReason(leadData.lost_reason ?? '')
        setSiteVisitAt(
          leadData.site_visit_at ? new Date(leadData.site_visit_at).toISOString().slice(0, 16) : ''
        )
        setSiteVisitNotes(leadData.site_visit_notes ?? '')
      }
      if (jobData) {
        setScopeNotes(jobData.scope_notes ?? '')
        if ((jobData as Job & { estimate_token?: string }).estimate_token) {
          const baseUrl = window.location.origin.replace(/^http:\/\/localhost.*/, 'https://aguirremoderntile.com')
          setEstimateUrl(`${baseUrl}/estimates/${(jobData as Job & { estimate_token: string }).estimate_token}`)
        }
      }
      setLoading(false)
    }
    load()
  }, [id, router])

  async function patchLead(updates: Record<string, unknown>) {
    if (!lead) return null
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      toast('Update failed', 'error')
      return null
    }
    const data = (await res.json()) as QuoteRequest
    setLead(data)
    return data
  }

  async function patchJob(updates: Record<string, unknown>) {
    if (!job) return null
    const res = await fetch(`/api/jobs/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      toast('Job update failed', 'error')
      return null
    }
    const data = (await res.json()) as Job
    setJob(data)
    return data
  }

  async function saveCrmFields() {
    if (!lead) return
    setSaving(true)
    await patchLead({
      notes,
      next_follow_up: nextFollowUp || null,
      source,
      lost_reason: lostReason || null,
      last_contact_at: new Date().toISOString(),
      site_visit_at: siteVisitAt ? new Date(siteVisitAt).toISOString() : null,
      site_visit_notes: siteVisitNotes || null,
    })
    setSaving(false)
    toast('Saved', 'success')
  }

  async function saveScope() {
    if (!job) return
    setSaving(true)
    await patchJob({ scope_notes: scopeNotes })
    setSaving(false)
    toast('Scope notes saved', 'success')
  }

  async function startWorkingThisLead() {
    if (!lead) return
    setConvertingId(lead.id)
    try {
      const res = await fetch(`/api/leads/${lead.id}/convert`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409 && data.existing_job_id) {
          // Already had a job — just reload to show the workspace
          router.refresh()
          return
        }
        throw new Error(data.error || 'Failed to start working')
      }
      toast('Working it now — start the estimate below', 'success')
      // Reload to fetch the new job and show the workspace
      window.location.reload()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Action failed', 'error')
      setConvertingId(null)
    }
  }

  async function generateEstimateLink() {
    if (!job) return
    setGeneratingLink(true)
    try {
      const res = await fetch(`/api/jobs/${job.id}/estimate-link`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to generate link')
      const data = await res.json()
      setEstimateUrl(data.url)
      // Bump status to quoted if currently lead
      if (job.status === 'lead') {
        await patchJob({ status: 'quoted' })
      }
      toast('Estimate link ready to share', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error')
    } finally {
      setGeneratingLink(false)
    }
  }

  async function copyEstimateUrl() {
    if (!estimateUrl) return
    try {
      await navigator.clipboard.writeText(estimateUrl)
      setCopyingUrl(true)
      setTimeout(() => setCopyingUrl(false), 2000)
    } catch {
      // ignore — user can select manually
    }
  }

  // Photos attach to whichever entity the lead workspace was loaded with.
  // Lead with a quote_request → /api/quotes/[qr-id]/photos. Job-only lead
  // (no QR) → /api/jobs/[job-id]/photos. Same UI either way.
  function photoApiBase(): string | null {
    if (lead) return `/api/quotes/${lead.id}/photos`
    if (job) return `/api/jobs/${job.id}/photos`
    return null
  }

  async function uploadPhotos(files: FileList | null) {
    const base = photoApiBase()
    if (!base || !files || files.length === 0) return
    setUploadingPhotos(true)
    try {
      const form = new FormData()
      Array.from(files).forEach((f) => form.append('photos', f))
      const res = await fetch(base, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      // Refetch the photos list with signed URLs (the upload response only
      // returns id + file_name, not URLs).
      const refreshed = await fetch(base)
      if (refreshed.ok) {
        const list = (await refreshed.json()) as QuoteRequestPhoto[]
        setPhotos(Array.isArray(list) ? list : [])
      }
      const noun = data.uploaded === 1 ? 'photo' : 'photos'
      toast(`Uploaded ${data.uploaded} ${noun}${data.failed ? ` (${data.failed} failed)` : ''}`, 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed', 'error')
    } finally {
      setUploadingPhotos(false)
    }
  }

  async function deletePhoto(photoId: string) {
    const base = photoApiBase()
    if (!base) return
    if (!confirm('Delete this photo?')) return
    setDeletingPhotoId(photoId)
    const prev = photos
    setPhotos((p) => p.filter((x) => x.id !== photoId))
    try {
      const res = await fetch(`${base}/${photoId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Delete failed')
      }
    } catch (err) {
      setPhotos(prev)
      toast(err instanceof Error ? err.message : 'Delete failed', 'error')
    } finally {
      setDeletingPhotoId(null)
    }
  }

  async function sendToJobs() {
    if (!job) return
    if (!confirm('Send to Jobs? This locks in the estimate as a job and moves it to the operations workflow. You can revert from the Jobs page if needed.')) {
      return
    }
    setAdvancing(true)
    try {
      await patchJob({ status: 'accepted_not_scheduled' })
      toast('Sent to Jobs — view in operations', 'success')
      router.push(`/dashboard/jobs/${job.id}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error')
    } finally {
      setAdvancing(false)
    }
  }

  async function updateLeadStatus(newStatus: QuoteRequestStatus) {
    await patchLead({ status: newStatus })
    toast(`Marked as ${newStatus}`)
  }

  // Derive the unified contact/project data
  const display = useMemo(() => {
    return {
      client_name: lead?.client_name ?? job?.client_name ?? 'Unknown',
      client_phone: lead?.client_phone ?? job?.client_phone ?? null,
      client_email: lead?.client_email ?? job?.client_email ?? null,
      client_address: lead?.answers?.address ?? job?.client_address ?? null,
      project_type: lead?.project_type ?? job?.job_type ?? null,
      title: job?.title ?? null,
      created_at: lead?.created_at ?? job?.created_at ?? null,
    }
  }, [lead, job])

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading…</div>
  }

  if (!lead && !job) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Lead not found.</p>
        <Link href="/dashboard/leads" className="text-primary-600 hover:underline text-sm">
          ← Back to Leads
        </Link>
      </div>
    )
  }

  const answerEntries = lead ? Object.entries(lead.answers).filter(([, v]) => v) : []
  const isWorkspaceMode = !!job
  const inquiryReadyToWork = lead && !job && (lead.status === 'new' || lead.status === 'reviewed')

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/leads"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Leads
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{display.client_name}</h1>
            {job && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${jobStatusColors[job.status] ?? 'bg-gray-100 text-gray-700'}`}>
                {job.status.replace(/_/g, ' ')}
              </span>
            )}
            {!job && lead && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[lead.status]}`}>
                {lead.status}
              </span>
            )}
            {job && job.job_number != null && (
              <span className="text-xs text-gray-400">#{job.job_number}</span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {display.title ?? (display.project_type ? `${display.project_type} project` : 'Lead')}
            {display.created_at && ` · Created ${new Date(display.created_at).toLocaleDateString()}`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Job context (line items + scope notes + originating lead) is more useful
              for estimate review than the bare lead context, so prefer it when a job exists. */}
          {job ? (
            <CopyContextButton jobId={job.id} />
          ) : (
            lead && <CopyContextButton leadId={lead.id} />
          )}

          {/* "Start working this lead" — appears only when there's no job yet */}
          {inquiryReadyToWork && (
            <button
              onClick={startWorkingThisLead}
              disabled={convertingId === lead.id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-60"
            >
              {convertingId === lead.id ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Start working this lead
                </>
              )}
            </button>
          )}

          {/* "Send to Jobs" — appears in workspace mode at quoted/estimate_revised */}
          {job && (job.status === 'quoted' || job.status === 'estimate_revised') && (
            <button
              onClick={sendToJobs}
              disabled={advancing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-60"
              title="Customer accepted — move this to operations"
            >
              {advancing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send to Jobs
                </>
              )}
            </button>
          )}

          {lead && lead.status === 'new' && (
            <button
              onClick={() => updateLeadStatus('reviewed')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-yellow-700 bg-yellow-50 rounded-md hover:bg-yellow-100"
            >
              <CheckCircle className="w-4 h-4" />
              Mark reviewed
            </button>
          )}

          {lead && (lead.status === 'new' || lead.status === 'reviewed') && (
            <button
              onClick={() => updateLeadStatus('archived')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              <Archive className="w-4 h-4" />
              Archive
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT — main workspace */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact card */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Contact</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-gray-900">{display.client_name}</span>
              </div>
              {display.client_phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <a href={`tel:${display.client_phone}`} className="text-primary-600 hover:underline">
                    {display.client_phone}
                  </a>
                </div>
              )}
              {display.client_email && (
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <a href={`mailto:${display.client_email}`} className="text-primary-600 hover:underline">
                    {display.client_email}
                  </a>
                </div>
              )}
              {display.client_address && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <span className="text-gray-900">{display.client_address}</span>
                </div>
              )}
              {(lead?.customer_id || job?.customer_id) && (
                <div className="pt-2">
                  <Link
                    href={`/dashboard/customers/${lead?.customer_id ?? job?.customer_id}`}
                    className="text-sm text-primary-600 hover:underline"
                  >
                    View customer history →
                  </Link>
                </div>
              )}
            </dl>
          </div>

          {/* Estimate workspace — appears when there's a job */}
          {isWorkspaceMode && job && (
            <>
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    Customer-facing estimate
                  </h2>
                  {!estimateUrl && (
                    <button
                      onClick={generateEstimateLink}
                      disabled={generatingLink}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-60"
                    >
                      {generatingLink ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Generate share URL
                    </button>
                  )}
                </div>
                {estimateUrl ? (
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={estimateUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 px-3 py-2 text-xs font-mono border border-gray-200 rounded bg-gray-50 text-gray-700"
                    />
                    <button
                      onClick={copyEstimateUrl}
                      className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded"
                    >
                      {copyingUrl ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copyingUrl ? 'Copied' : 'Copy'}
                    </button>
                    <a
                      href={estimateUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    Generate a share URL once you&apos;ve built the line items below. Sending the URL bumps status to <strong>quoted</strong>.
                  </p>
                )}
                {estimateUrl && (
                  <p className="text-xs text-gray-400 mt-2">
                    The URL stays the same forever — edits to line items below appear instantly on the customer&apos;s page.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Line items</h2>
                <GenerateEstimateModal
                  jobId={job.id}
                  hasExistingItems={Array.isArray(job.line_items) && job.line_items.length > 0}
                />
              </div>

              <JobLineItems
                items={(job.line_items ?? []) as Job['line_items']}
                jobId={job.id}
                isOwner={true}
                marginPercent={job.margin_percent}
              />

              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-900">Scope notes (customer-facing)</h2>
                  <button
                    onClick={saveScope}
                    disabled={saving || scopeNotes === (job.scope_notes ?? '')}
                    className="text-xs px-2 py-1 rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
                <textarea
                  value={scopeNotes}
                  onChange={(e) => setScopeNotes(e.target.value)}
                  rows={10}
                  placeholder="SCOPE OF WORK…"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Renders into the customer-facing estimate. Use SCOPE OF WORK / WARRANTY / WHAT&apos;S INCLUDED / WHAT&apos;S NOT INCLUDED / PAYMENT headers.
                </p>
              </div>
            </>
          )}

          {/* Project intake details (from quote_request) */}
          {answerEntries.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Project intake (from form)</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {answerEntries.map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs text-gray-500 capitalize">
                      {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}
                    </dt>
                    <dd className="text-sm text-gray-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Photos — visible whenever there's a lead OR a job. Lead-with-QR
              records use /api/quotes/[id]/photos (the public form's upload
              endpoint); job-only records use /api/jobs/[id]/photos.
              photoApiBase() routes upload/delete to the right one. */}
          {(lead || job) && (
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-gray-400" />
                  Photos {photos.length > 0 && `(${photos.length})`}
                </h2>
                <label
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    uploadingPhotos
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-primary-50 text-primary-700 border border-primary-200 hover:bg-primary-100'
                  }`}
                >
                  {uploadingPhotos ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" /> Uploading…
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-3 h-3" /> Upload photos
                    </>
                  )}
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    onChange={(e) => {
                      uploadPhotos(e.target.files)
                      e.target.value = ''
                    }}
                    disabled={uploadingPhotos}
                    className="hidden"
                  />
                </label>
              </div>
              {photos.length === 0 ? (
                <p className="text-xs text-gray-500 italic">
                  No photos yet. Customer can upload from the quote form, or you can add jobsite
                  shots from your phone here.
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {photos.map((photo) => (
                    <div key={photo.id} className="relative group aspect-square">
                      <button
                        type="button"
                        onClick={() => photo.url && setLightbox(photo.url)}
                        className="absolute inset-0 overflow-hidden rounded-lg bg-gray-100 hover:opacity-90 transition-opacity"
                        title={photo.file_name}
                      >
                        {photo.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photo.url} alt={photo.file_name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">No preview</div>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePhoto(photo.id)}
                        disabled={deletingPhotoId === photo.id}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-opacity disabled:opacity-50"
                        title="Delete photo"
                      >
                        {deletingPhotoId === photo.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* In-person estimate visit (only when there's a quote_request) */}
          {lead && (
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400" />
                In-person estimate visit
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Date &amp; time</label>
                  <input
                    type="datetime-local"
                    value={siteVisitAt}
                    onChange={(e) => setSiteVisitAt(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Visit notes</label>
                  <input
                    type="text"
                    value={siteVisitNotes}
                    onChange={(e) => setSiteVisitNotes(e.target.value)}
                    placeholder="Gate code, parking, what to bring..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Save on the right → shows on the Schedule tab.
              </p>
            </div>
          )}

          {/* Notes */}
          {lead && (
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Internal notes</h2>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
                placeholder="Call notes, budget, timeline, tile preferences..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>
          )}
        </div>

        {/* RIGHT — sales tracking */}
        <div className="space-y-6">
          {lead && (
            <>
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Sales tracking</h2>
                <div className="space-y-4">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                      <Tag className="w-3 h-3" /> Source
                    </label>
                    <select
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      {sources.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                      <Calendar className="w-3 h-3" /> Next follow-up
                    </label>
                    <input
                      type="date"
                      value={nextFollowUp}
                      onChange={(e) => setNextFollowUp(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Last contact</label>
                    <p className="text-sm text-gray-900">
                      {lead.last_contact_at ? new Date(lead.last_contact_at).toLocaleString() : 'Never recorded'}
                    </p>
                  </div>

                  {lead.status === 'archived' && (
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Lost reason</label>
                      <input
                        type="text"
                        value={lostReason}
                        onChange={(e) => setLostReason(e.target.value)}
                        placeholder="Price, timeline, scope mismatch..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={saveCrmFields}
                disabled={saving}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save sales fields'}
              </button>
            </>
          )}

          {job && (
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Estimate summary</h2>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-gray-500">Quote total</dt>
                  <dd className="text-2xl font-bold text-gray-900">
                    ${(job.estimated_cost ?? 0).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">10% deposit</dt>
                  <dd className="text-base font-semibold text-primary-700">
                    ${((job.estimated_cost ?? 0) * 0.1).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Crew days</dt>
                  <dd className="text-sm text-gray-900">{job.estimated_days ?? '—'}</dd>
                </div>
                {job.margin_percent != null && (
                  <div>
                    <dt className="text-xs text-gray-500">Profit margin</dt>
                    <dd
                      className={`text-base font-semibold ${
                        job.margin_percent >= 40
                          ? 'text-emerald-700'
                          : job.margin_percent >= 30
                            ? 'text-amber-600'
                            : 'text-red-600'
                      }`}
                    >
                      {Number(job.margin_percent).toFixed(1)}%
                    </dd>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Aguirre target: 39-45%. Hand edits to line items aren&apos;t reflected here until next regenerate.
                    </p>
                  </div>
                )}
              </dl>
              {job.status === 'lead' && (
                <p className="mt-3 text-xs text-gray-500 italic">
                  When you generate the share URL, status moves to <strong>quoted</strong>.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6 cursor-zoom-out"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Lead photo" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  )
}
