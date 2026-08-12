'use client'

import { useCallback, useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ArrowRight, Phone, Mail, User, Calendar, Tag, Save, Archive,
  CheckCircle, MapPin, ImageIcon, Sparkles, Loader2, Send, Copy, Check,
  ExternalLink, FileText, Trash2, X, MessageSquare, Star, ThumbsDown,
} from 'lucide-react'
import { toast } from '@/components/Toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { logError } from '@/lib/logger'
import CopyContextButton from '@/components/dashboard/CopyContextButton'
import GenerateEstimateModal from '@/components/dashboard/GenerateEstimateModal'
import JobLineItems from '@/components/dashboard/JobLineItems'
import StructuredScopeEditor from '@/components/dashboard/StructuredScopeEditor'
import EstimateVersionHistory from '@/components/dashboard/EstimateVersionHistory'
import EstimateOptionsBar from '@/components/dashboard/EstimateOptionsBar'
import type { JobEstimateVersion } from '@/lib/estimateVersions'
import WorkOrderShareLink from '@/components/dashboard/WorkOrderShareLink'
import { deriveQuoteHints } from '@/lib/quoteHints'
import { deriveScheduledEnd } from '@/lib/jobScheduling'
import { JOB_STATUS_OPTIONS } from '@/lib/jobStatusTransitions'
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
  accepted_not_scheduled: 'bg-blue-100 text-blue-800',
  scheduled: 'bg-indigo-100 text-indigo-800',
  in_progress: 'bg-orange-100 text-orange-800',
  waiting_for_materials: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-800',
  paid: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-200 text-gray-600',
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

export default function LeadWorkspace({ id, isOwner }: { id: string; isOwner: boolean }) {
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
  const [sendingEstimate, setSendingEstimate] = useState(false)

  // Editable form state
  const [notes, setNotes] = useState('')
  const [nextFollowUp, setNextFollowUp] = useState('')
  const [source, setSource] = useState<string>('website')
  const [lostReason, setLostReason] = useState('')
  const [siteVisitAt, setSiteVisitAt] = useState('')
  const [siteVisitNotes, setSiteVisitNotes] = useState('')
  const [estimateUrl, setEstimateUrl] = useState<string | null>(null)
  // Proposed install start date — set during the sales conversation so the
  // customer sees a concrete date on their estimate. When they pay the
  // deposit, the webhook auto-fills scheduled_end from estimated_days.
  const [proposedStart, setProposedStart] = useState<string>('')
  const [savingStart, setSavingStart] = useState(false)

  // Customer's prior job history — fetched on the side once we know the
  // customer_id, so the contact card can surface "Repeat — N prior jobs"
  // and last-project context without making Vince click through to the
  // customer page.
  const [priorJobs, setPriorJobs] = useState<Job[]>([])

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
        setProposedStart(jobData.scheduled_start ?? '')
        if ((jobData as Job & { estimate_token?: string }).estimate_token) {
          const baseUrl = window.location.origin.replace(/^http:\/\/localhost.*/, 'https://aguirremoderntile.com')
          setEstimateUrl(`${baseUrl}/estimates/${(jobData as Job & { estimate_token: string }).estimate_token}`)
        }
      }
      setLoading(false)
    }
    load()
  }, [id, router])

  // Re-fetch just the job and fold the fresh row into local state. Called
  // after an estimate is (re)generated so the new line items, quote total,
  // and margin appear immediately — this is a fetch-once client component, so
  // GenerateEstimateModal's router.refresh() alone can't update our state.
  // Deliberately scoped to the job (not the whole deal) so unsaved edits in
  // the notes / sales-tracking fields survive a regenerate.
  // Bumped whenever the estimate is re-priced, so EstimateVersionHistory
  // re-fetches without this component owning its data.
  const [estimateRev, setEstimateRev] = useState(0)

  // Quote options (migration 048). Most jobs have exactly one, backfilled as
  // "Standard" — the switcher only renders once a second one exists.
  const [options, setOptions] = useState<JobEstimateVersion[]>([])
  const [activeOptionKey, setActiveOptionKey] = useState('')

  const reloadJob = useCallback(async () => {
    const jobId = job?.id ?? lead?.converted_job_id
    if (!jobId) return
    const res = await fetch(`/api/jobs/${jobId}`)
    if (!res.ok) return
    const data = (await res.json()) as Job
    setJob(data)
    // Nudge the quote-history card to re-fetch — a regenerate just wrote a
    // new revision it can't know about otherwise.
    setEstimateRev((n) => n + 1)
    if ((data as Job & { estimate_token?: string }).estimate_token) {
      const baseUrl = window.location.origin.replace(/^http:\/\/localhost.*/, 'https://aguirremoderntile.com')
      setEstimateUrl(`${baseUrl}/estimates/${(data as Job & { estimate_token: string }).estimate_token}`)
    }
  }, [job?.id, lead?.converted_job_id])

  const loadOptions = useCallback(async () => {
    const jobId = job?.id ?? lead?.converted_job_id
    if (!jobId) return
    const res = await fetch(`/api/jobs/${jobId}/estimate-options`, { cache: 'no-store' })
    if (!res.ok) return
    const data = await res.json()
    const opts: JobEstimateVersion[] = data.options ?? []
    setOptions(opts)
    // Keep the current selection if it survived; otherwise fall back to the
    // active option so the editors below never point at nothing.
    setActiveOptionKey((prev) =>
      opts.some((o) => o.option_key === prev)
        ? prev
        : (opts.find((o) => o.is_primary)?.option_key ?? opts[0]?.option_key ?? '')
    )
  }, [job?.id, lead?.converted_job_id])

  useEffect(() => {
    loadOptions()
  }, [loadOptions, estimateRev])

  const activeOption = options.find((o) => o.option_key === activeOptionKey) ?? null

  // Once we know the customer_id, fetch their job history so the contact
  // card can show "Repeat customer — N prior jobs". Exclude the current
  // job from the count so a fresh-converted lead doesn't say "1 prior".
  useEffect(() => {
    const customerId = lead?.customer_id ?? job?.customer_id
    if (!customerId) {
      setPriorJobs([])
      return
    }
    let cancelled = false
    fetch(`/api/customers/${customerId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { jobs?: Job[] } | null) => {
        if (cancelled || !data?.jobs) return
        const currentJobId = job?.id
        setPriorJobs(data.jobs.filter((j) => j.id !== currentJobId))
      })
      .catch(() => {
        if (!cancelled) setPriorJobs([])
      })
    return () => {
      cancelled = true
    }
  }, [lead?.customer_id, job?.customer_id, job?.id])

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


  // Save proposed install start date the moment the picker fires. The date
  // becomes visible to the customer on the next estimate page render and
  // tees up the auto-schedule when they pay the deposit. Sends null on
  // clear so we don't write an empty string to the DB.
  async function saveProposedStart(value: string) {
    setProposedStart(value)
    if (!job) return
    setSavingStart(true)
    await patchJob({ scheduled_start: value || null })
    setSavingStart(false)
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
    if (!base) {
      toast('No lead or job loaded yet — try again in a moment', 'error')
      return
    }
    if (!files || files.length === 0) {
      // User cancelled the picker — silent return is fine.
      return
    }
    // Snapshot the FileList into a plain array immediately. FileList is a
    // live reference to the input element; if we await before iterating,
    // a later e.target.value = '' clear (see the input's onChange) can null
    // out the entries before we read them. Array.from() is synchronous and
    // captures the actual File objects, which are safe to use after.
    const fileArr = Array.from(files)
    setUploadingPhotos(true)
    try {
      const form = new FormData()
      fileArr.forEach((f) => form.append('photos', f))
      const res = await fetch(base, { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || `Upload failed (${res.status})`)
      }
      const refreshed = await fetch(base)
      if (refreshed.ok) {
        const list = (await refreshed.json()) as QuoteRequestPhoto[]
        setPhotos(Array.isArray(list) ? list : [])
      }
      const noun = data.uploaded === 1 ? 'photo' : 'photos'
      toast(`Uploaded ${data.uploaded} ${noun}${data.failed ? ` (${data.failed} failed)` : ''}`, 'success')
    } catch (err) {
      logError('Photo upload failed:', err)
      toast(err instanceof Error ? err.message : 'Upload failed', 'error')
    } finally {
      setUploadingPhotos(false)
    }
  }

  async function deletePhoto(photoId: string) {
    const base = photoApiBase()
    if (!base) return
    if (!(await confirmDialog({ title: 'Delete this photo?', tone: 'danger', confirmLabel: 'Delete' }))) return
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
    if (!(await confirmDialog({
      title: 'Accept this estimate?',
      message: 'This locks in the estimate and switches this deal to the operations view (scheduling, crew, labor, payment) — right here on the same page. You can revert with the status dropdown.',
      confirmLabel: 'Accept',
    }))) {
      return
    }
    setAdvancing(true)
    try {
      await patchJob({ status: 'accepted_not_scheduled' })
      toast('Accepted — operations view unlocked', 'success')
      router.refresh()
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

  async function sendEstimateToCustomer() {
    if (!job) return
    setSendingEstimate(true)
    try {
      const res = await fetch(`/api/jobs/${job.id}/send-estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Send failed')
      // Build a clear toast — what landed, what didn't, why.
      const parts: string[] = []
      if (data.sms?.success) parts.push('SMS sent')
      else if (data.sms) parts.push(`SMS skipped (${data.sms.error})`)
      if (data.email?.success) parts.push('email sent')
      else if (data.email) parts.push(`email skipped (${data.email.error})`)
      const summary = parts.length > 0 ? parts.join(' · ') : 'No channels available'
      toast(summary, parts.some((p) => p.includes('sent')) ? 'success' : 'error')
      // Reflect server-side state changes locally without a full reload.
      // The endpoint may have generated a token (so the share URL block
      // appears) and advanced status from lead to quoted.
      if (job) {
        const updates: Partial<Job> = {}
        if (data.estimate_url && !job.estimate_token) {
          updates.estimate_token = data.estimate_url.split('/').pop() ?? null
        }
        if (job.status === 'lead' && data.new_status === 'quoted') {
          updates.status = 'quoted'
        }
        if (Object.keys(updates).length > 0) {
          setJob({ ...job, ...updates } as Job)
        }
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Send failed', 'error')
    } finally {
      setSendingEstimate(false)
    }
  }

  async function changeJobStatus(newStatus: string) {
    if (!job || newStatus === job.status) return
    try {
      await patchJob({ status: newStatus })
      toast(`Status: ${newStatus.replace(/_/g, ' ')}`, 'success')
      // Statuses past the lead stage render the operations layout (install
      // scheduler, crew assignment, labor, payment). It lives at this same URL
      // now, so refresh the server wrapper to swap the view in place.
      if (!LEAD_STAGE_STATUSES.includes(newStatus)) {
        router.refresh()
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Status change failed', 'error')
    }
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

  // Pre-fill hints for the GenerateEstimateModal — derived once from the
  // originating quote_request so reopening the modal doesn't recompute or
  // wobble. answers may be a JSONB object; deriveQuoteHints typechecks the
  // shape. Job-only leads (no QR) get null hints — modal falls back to
  // FALLBACK_TEMPLATE_NAMES[0] and an empty sqft input.
  const quoteHints = useMemo(
    () =>
      deriveQuoteHints(
        lead?.project_type ?? null,
        (lead?.answers ?? null) as Record<string, string> | null,
      ),
    [lead?.project_type, lead?.answers],
  )

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
              <select
                value={job.status}
                onChange={(e) => changeJobStatus(e.target.value)}
                title="Change status"
                className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer focus:ring-2 focus:ring-offset-1 focus:ring-primary-500 ${
                  jobStatusColors[job.status] ?? 'bg-gray-100 text-gray-700'
                }`}
              >
                {JOB_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-60"
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

          {/* "Accept & start" — appears in workspace mode at quoted/estimate_revised.
              Flips the deal to operations in place (no navigation away). */}
          {job && (job.status === 'quoted' || job.status === 'estimate_revised') && (
            <button
              onClick={sendToJobs}
              disabled={advancing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-60"
              title="Customer accepted — unlock the operations view"
            >
              {advancing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Accepting…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Accept &amp; start
                </>
              )}
            </button>
          )}

          {lead && lead.status === 'new' && (
            <button
              onClick={() => updateLeadStatus('reviewed')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] text-sm font-medium text-yellow-700 bg-yellow-50 rounded-md hover:bg-yellow-100"
            >
              <CheckCircle className="w-4 h-4" />
              Mark reviewed
            </button>
          )}

          {lead && (lead.status === 'new' || lead.status === 'reviewed') && (
            <button
              onClick={() => updateLeadStatus('archived')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              <Archive className="w-4 h-4" />
              Archive
            </button>
          )}

          {/* Cancel — visible whenever there's a job that isn't already
              cancelled. Same effect as picking "Cancelled" from the status
              dropdown, but a one-click button when a deal is dead. */}
          {job && job.status !== 'cancelled' && (
            <button
              onClick={async () => {
                if (await confirmDialog({
                  title: 'Cancel this lead?',
                  message: 'You can revert from the status dropdown.',
                  tone: 'danger',
                  confirmLabel: 'Cancel lead',
                  cancelLabel: 'Keep',
                })) {
                  changeJobStatus('cancelled')
                }
              }}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 rounded-md hover:bg-red-100 border border-red-200"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT — main workspace */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact card */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            {/* Repeat-customer banner — most important context at a glance.
                Shows total prior jobs, last project, last payment so Vince
                walks into the call already knowing the relationship.
                Renders only when the customer has prior jobs (excluding
                the current one). */}
            {priorJobs.length > 0 && (
              <RepeatCustomerBanner
                priorJobs={priorJobs}
                customerId={(lead?.customer_id ?? job?.customer_id) as string}
              />
            )}
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
              {/* Customer-facing estimate (share URL + Send) — owner only.
                  Crew never see the send controls or the estimate link. */}
              {isOwner && (
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    Customer-facing estimate
                  </h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    {!estimateUrl && (
                      <button
                        onClick={generateEstimateLink}
                        disabled={generatingLink}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 disabled:opacity-60"
                      >
                        {generatingLink ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Generate share URL
                      </button>
                    )}
                    <button
                      onClick={sendEstimateToCustomer}
                      disabled={sendingEstimate}
                      title="Send the estimate via SMS (OpenPhone) and email (if on file)"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-60"
                    >
                      {sendingEstimate ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Sending…
                        </>
                      ) : (
                        <>
                          <MessageSquare className="w-3 h-3" />
                          Send to customer
                        </>
                      )}
                    </button>
                  </div>
                </div>
                {estimateUrl ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <input
                      readOnly
                      value={estimateUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      className="w-full sm:flex-1 px-3 py-2 text-xs font-mono border border-gray-200 rounded bg-gray-50 text-gray-700"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={copyEstimateUrl}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 px-3 min-h-[44px] text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded"
                      >
                        {copyingUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copyingUrl ? 'Copied' : 'Copy'}
                      </button>
                      <a
                        href={estimateUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 px-3 min-h-[44px] text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open
                      </a>
                    </div>
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
              )}

              {/* Crew work order link — a separate public link with NO pricing,
                  for texting to the install crew. Edits to scope + materials
                  below show up instantly on it, same as the customer estimate. */}
              <WorkOrderShareLink job={job} />

              {/* Line-items header + estimate generator — owner only. The
                  generator re-prices the job (a price-edit control), so crew
                  don't get it. JobLineItems below still renders for crew, but
                  with isOwner=false it hides cost/margin and the editor. */}
              {/* Good/Better/Best switcher. Renders a bare "offer a second
                  option" control until there actually are two, so a normal
                  single-price job looks exactly as it did before. */}
              {isOwner && options.length > 0 && (
                <EstimateOptionsBar
                  jobId={job.id}
                  options={options}
                  activeKey={activeOptionKey}
                  onSelect={setActiveOptionKey}
                  onChanged={async () => {
                    await loadOptions()
                    await reloadJob()
                  }}
                />
              )}

              {isOwner && (
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900">
                    Line items
                    {activeOption && options.length > 1 && (
                      <span className="ml-2 text-xs font-normal text-gray-500">
                        · {activeOption.label}
                      </span>
                    )}
                  </h2>
                  {/* Hints derived from the originating quote_request answers
                      (template + sqft) so Vince doesn't re-type what the
                      customer already told us. The modal still shows them as
                      editable defaults — Vince confirms before generating. */}
                  <GenerateEstimateModal
                    jobId={job.id}
                    hasExistingItems={Array.isArray(job.line_items) && job.line_items.length > 0}
                    estimateSent={!!job.estimate_sent_at}
                    initialSqft={job.square_footage ?? quoteHints.initialSqft}
                    initialTemplate={quoteHints.initialTemplate ?? undefined}
                    initialAddons={quoteHints.initialAddons}
                    initialScopes={
                      (activeOption?.scopes as Job['scopes']) ??
                      (Array.isArray(job.scopes) ? job.scopes : null)
                    }
                    optionKey={options.length > 1 ? activeOptionKey : null}
                    onGenerated={reloadJob}
                  />
                </div>
              )}

              {/* Show the ACTIVE option's items. For a single-option job (and
                  for the primary option generally) these are the same array as
                  job.line_items, since the primary option mirrors the job. */}
              <JobLineItems
                items={
                  (activeOption?.line_items ?? job.line_items ?? []) as Job['line_items']
                }
                jobId={job.id}
                isOwner={isOwner}
                marginPercent={
                  isOwner
                    ? (Number(activeOption?.margin_percent ?? job.margin_percent) || null)
                    : null
                }
                optionId={options.length > 1 ? (activeOption?.id ?? null) : null}
                onSaved={() => setEstimateRev((n) => n + 1)}
              />

              {/* Scope belongs to the option it describes — "porcelain" and
                  "marble" are different work, and the customer reads each
                  option's scope under that option's price.

                  The key is load-bearing: this editor seeds its state once on
                  mount, so without remounting per option, switching tabs would
                  leave the previous option's text in the fields and save it
                  over the one now selected. */}
              <StructuredScopeEditor
                key={activeOption?.id ?? job.id}
                jobId={job.id}
                initialScopeNotes={activeOption?.scope_notes ?? job.scope_notes}
                optionId={options.length > 1 ? (activeOption?.id ?? null) : null}
                optionLabel={options.length > 1 ? (activeOption?.label ?? null) : null}
                onSaved={() => setEstimateRev((n) => n + 1)}
              />

              {/* Quote history — every revision of this estimate. Renders
                  nothing until the job has been priced at least once, so a
                  fresh lead doesn't get an empty card. */}
              <EstimateVersionHistory
                jobId={job.id}
                isOwner={isOwner}
                refreshKey={estimateRev}
                onRestored={reloadJob}
              />
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
                        className="absolute top-1 right-1 p-1.5 rounded-full bg-black/60 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-red-600 transition-opacity disabled:opacity-50"
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

          {job && isOwner && (
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Estimate summary</h2>
              {/* Lost callout — surfaces the reason captured by the leads page
                  "Mark as lost" action (status -> cancelled + lost_reason) so a
                  dead deal explains itself here, not just in the pipeline toast. */}
              {job.status === 'cancelled' && job.lost_reason && (
                <div className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
                  <ThumbsDown className="w-4 h-4 text-red-700 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-red-900 leading-tight">Marked lost</p>
                    <p className="text-xs text-red-700 leading-tight">{job.lost_reason}</p>
                  </div>
                </div>
              )}
              {/* Deposit-paid callout — visible the moment a deposit lands
                  (Stripe webhook or manual entry), so Vince knows on this
                  page (not just on the operations job page) that the deal
                  is live. */}
              {job.amount_paid != null && job.amount_paid > 0 && (
                <div className="mb-3 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2">
                  <CheckCircle className="w-4 h-4 text-green-700 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-green-900 leading-tight">
                      Deposit paid · ${Number(job.amount_paid).toLocaleString()}
                    </p>
                    {(job.estimate_accepted_at || job.updated_at) && (
                      <p className="text-xs text-green-700 leading-tight">
                        {new Date(job.estimate_accepted_at ?? job.updated_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                </div>
              )}
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
                {/* Proposed install start — committing to a date during the
                    sales conversation creates urgency on the customer's
                    estimate page ("this slot is yours") and the calendar
                    auto-fills the full block when they pay the deposit. */}
                <div>
                  <dt className="text-xs text-gray-500 flex items-center gap-1.5 mb-1">
                    <Calendar className="w-3 h-3" /> Proposed install start
                  </dt>
                  <input
                    type="date"
                    value={proposedStart}
                    onChange={(e) => saveProposedStart(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <ProposedStartHelper
                    saving={savingStart}
                    proposedStart={proposedStart}
                    estimatedDays={job.estimated_days}
                  />
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

// Helper text under the proposed install start date input. Shows a live
// preview of when the install will end (using the same deriveScheduledEnd
// formula the deposit webhook applies) so Vince sees the consequence of
// his date choice before saving. Empty state explains where the date
// shows up downstream.
function ProposedStartHelper({
  saving,
  proposedStart,
  estimatedDays,
}: {
  saving: boolean
  proposedStart: string
  estimatedDays: number | null
}) {
  if (saving) {
    return <p className="text-[10px] text-gray-400 mt-1">Saving…</p>
  }
  if (!proposedStart) {
    return (
      <p className="text-[10px] text-gray-400 mt-1">
        Customer sees this on their estimate. Calendar auto-fills the
        end date when the deposit lands.
      </p>
    )
  }
  // Pass null as currentEnd so the helper computes a preview regardless of
  // what's in the DB — we want to show the future state, not today's.
  const previewEnd = deriveScheduledEnd(proposedStart, estimatedDays, null)
  if (!previewEnd || !estimatedDays) {
    return (
      <p className="text-[10px] text-gray-400 mt-1">
        Add crew days (Generate Estimate) to preview the end date.
      </p>
    )
  }
  const endLabel = new Date(previewEnd + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const daysText = estimatedDays === 1 ? '1 day' : `${estimatedDays} days`
  return (
    <p className="text-[10px] text-emerald-700 mt-1">
      Through {endLabel} · {daysText}
    </p>
  )
}

// Banner showing prior-job count + last-project summary. Only mounts when
// priorJobs.length > 0, so the "this is a repeat customer" signal is loud
// the moment Vince opens the lead — without polluting first-time leads
// with empty-state UI.
function RepeatCustomerBanner({
  priorJobs,
  customerId,
}: {
  priorJobs: Job[]
  customerId: string
}) {
  // Most recent prior job — sorted desc by created_at. The customers API
  // returns them sorted that way already, but enforce here in case order
  // changes upstream.
  const last = [...priorJobs].sort((a, b) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? '')
  )[0]
  const lastDate = last?.created_at
    ? new Date(last.created_at).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      })
    : null
  const lastAmount =
    last && (last.amount_paid ?? 0) > 0
      ? `$${Number(last.amount_paid).toLocaleString()}`
      : last?.estimated_cost
        ? `$${Number(last.estimated_cost).toLocaleString()} est.`
        : null

  return (
    <div className="mb-4 rounded-md border border-purple-200 bg-purple-50 p-3">
      <div className="flex items-start gap-2">
        <Star className="w-4 h-4 text-purple-700 fill-purple-700 mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-purple-900 leading-tight">
            Repeat customer · {priorJobs.length} prior job
            {priorJobs.length === 1 ? '' : 's'}
          </p>
          {last && (
            <p className="text-xs text-purple-800 mt-0.5 truncate">
              Last: {last.title}
              {lastDate ? ` · ${lastDate}` : ''}
              {lastAmount ? ` · ${lastAmount}` : ''}
            </p>
          )}
        </div>
        <Link
          href={`/dashboard/customers/${customerId}`}
          className="text-xs font-medium text-purple-700 hover:text-purple-900 whitespace-nowrap"
        >
          History →
        </Link>
      </div>
    </div>
  )
}
