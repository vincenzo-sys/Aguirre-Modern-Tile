'use client'

// All persistence + side-effect logic for the leads page lives here so
// page.tsx stays declarative (state + JSX, no fetch boilerplate). Returns
// a LeadCardHandlers bundle that the page passes straight through to
// every card, plus sheet state for the three bottom-sheet flows.
//
// Three patterns are reused across most handlers:
//   1. Optimistic local update via setItems
//   2. PATCH/POST against /api/{leads,jobs}/[id]
//   3. Rollback on error
// The `optimisticPatch` helper folds those into one call. saveStage
// is split into three named sub-helpers (QR→QR, job→job, QR→job-promote)
// dispatched from a 5-line wrapper.
//
// C3 (undo toast) is wired here: on a successful stage change we fire
// a toast with an Undo button that calls saveStage again with the
// prior stage, bypassing the undo wiring to avoid loops.

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/Toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import type { PipelineItem, PipelineStage } from '@/app/api/pipeline/route'
import type { LeadCardHandlers } from '@/components/dashboard/LeadCard'
import { stageOptionsFor, jobStatusForStage, STAGE_META } from '@/lib/leadStages'

export type SheetState =
  | { mode: 'schedule-visit'; item: PipelineItem }
  | { mode: 'share-estimate'; item: PipelineItem; url: string }
  | { mode: 'pick-followup'; item: PipelineItem }
  | null

type Params = {
  items: PipelineItem[]
  setItems: React.Dispatch<React.SetStateAction<PipelineItem[]>>
  loadPipeline: () => Promise<void>
}

export function useLeadHandlers({ items, setItems, loadPipeline }: Params) {
  const router = useRouter()
  const [sheet, setSheet] = useState<SheetState>(null)

  // itemsRef so callbacks fired from toasts (which close over an
  // older render's `items`) can still see the latest pipeline state.
  const itemsRef = useRef(items)
  itemsRef.current = items

  // ── Local optimistic update + rollback primitive ─────────────────

  const updateItemLocally = useCallback(
    (itemId: string, kind: 'quote_request' | 'job', patch: Partial<PipelineItem>) => {
      setItems((prev) => prev.map((it) => (it.id === itemId && it.kind === kind ? { ...it, ...patch } : it)))
    },
    [setItems],
  )

  /**
   * Snapshot the keys we're about to change, apply the local patch,
   * fire the PATCH; rollback to the snapshot on a non-OK response.
   * `localPatch` keys must exist on PipelineItem. `body` is whatever
   * the server expects (often a superset/subset of `localPatch`).
   */
  const optimisticPatch = useCallback(
    async (
      item: PipelineItem,
      localPatch: Partial<PipelineItem>,
      endpoint: string,
      body: Record<string, unknown>,
    ) => {
      const prevSnapshot: Partial<PipelineItem> = {}
      for (const k of Object.keys(localPatch) as (keyof PipelineItem)[]) {
        // @ts-expect-error — dynamic key copy
        prevSnapshot[k] = item[k]
      }
      updateItemLocally(item.id, item.kind, localPatch)
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        updateItemLocally(item.id, item.kind, prevSnapshot)
        throw new Error(`Save failed: ${res.status}`)
      }
    },
    [updateItemLocally],
  )

  // ── Stage transitions: 3 helpers + a dispatcher ──────────────────

  // QR row → QR-only stage. Mostly a status flip; visit_scheduled
  // also needs a site_visit_at date (prompt the user if missing).
  // Going to 'new' or 'reviewed' clears site_visit_at so the derived
  // stage (see /api/pipeline) doesn't keep returning the visit-scheduled
  // stage. Soft-undo limitation: clearing site_visit_at on a move back TO
  // 'new' loses the visit date; Undo can re-set the stage but not restore
  // the old date.
  const saveStageQrToQr = useCallback(
    async (item: PipelineItem, newStage: 'new' | 'in_person_estimate_scheduled') => {
      if (newStage === 'in_person_estimate_scheduled') {
        let dt = item.site_visit_at
        if (!dt) {
          const input = window.prompt('When is the site visit?\n(YYYY-MM-DD HH:MM, e.g. 2026-05-22 14:00)')
          if (!input) return false
          const parsed = new Date(input.replace(' ', 'T'))
          if (Number.isNaN(parsed.getTime())) {
            toast('Invalid date format', 'error')
            return false
          }
          dt = parsed.toISOString()
        }
        await optimisticPatch(
          item,
          { stage: 'in_person_estimate_scheduled', site_visit_at: dt },
          `/api/leads/${item.id}`,
          { site_visit_at: dt },
        )
      } else {
        await optimisticPatch(
          item,
          { stage: newStage, site_visit_at: null },
          `/api/leads/${item.id}`,
          { status: newStage, site_visit_at: null },
        )
      }
      return true
    },
    [optimisticPatch],
  )

  // The set of stages a job-row can drag into. Mirrors STAGE_ORDER minus the
  // QR-only stages.
  type JobStage = Exclude<PipelineStage, 'new' | 'in_person_estimate_scheduled'>

  const saveStageJobToJob = useCallback(
    async (item: PipelineItem, newStage: JobStage) => {
      const jobStatus = jobStatusForStage(newStage)!
      await optimisticPatch(
        item,
        { stage: newStage, job_status: jobStatus },
        `/api/jobs/${item.id}`,
        { status: jobStatus },
      )
    },
    [optimisticPatch],
  )

  // Cross-table: QR → job stage. Auto-converts via the convert
  // endpoint, then sets the new job's status if the target isn't
  // 'lead' (which convert already produces).
  const promoteQrThenSetStage = useCallback(
    async (item: PipelineItem, newStage: PipelineStage) => {
      const convertRes = await fetch(`/api/leads/${item.id}/convert`, { method: 'POST' })
      const convertData = await convertRes.json()
      if (!convertRes.ok) {
        // Lead was already converted (e.g. a stale card / double-tap). Don't
        // throw — resolve the card to its real state by refetching so it stops
        // looking stuck, and tell the user what happened.
        if (convertRes.status === 409 && convertData.existing_job_id) {
          toast('Already a job — refreshing', 'success')
          await loadPipeline()
          return
        }
        throw new Error(convertData.error ?? 'Conversion failed')
      }
      const newJobId: string = convertData.job?.id
      const targetJobStatus = jobStatusForStage(newStage)
      if (newJobId && targetJobStatus && targetJobStatus !== 'lead') {
        await fetch(`/api/jobs/${newJobId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: targetJobStatus }),
        })
      }
      await loadPipeline()
      toast('Lead promoted to job', 'success')
    },
    [loadPipeline],
  )

  // 5-line dispatcher. The `skipUndo` flag is set when this is called
  // from an Undo toast click, to prevent infinite undo-of-undo chains.
  const saveStage = useCallback(
    async (item: PipelineItem, newStage: PipelineStage, opts: { skipUndo?: boolean } = {}) => {
      const prevStage = item.stage
      // Single error chokepoint: every stage change (sheet pick AND undo)
      // flows through here. The sub-helpers throw on failure (optimisticPatch
      // already rolls back local state); we just surface the message so a
      // failed change is never silent. Returning instead of re-throwing lets
      // the picker close cleanly.
      try {
        if (
          item.kind === 'quote_request' &&
          (newStage === 'new' || newStage === 'in_person_estimate_scheduled')
        ) {
          const committed = await saveStageQrToQr(item, newStage)
          if (!committed) return
        } else if (
          item.kind === 'job' &&
          newStage !== 'new' &&
          newStage !== 'in_person_estimate_scheduled'
        ) {
          await saveStageJobToJob(item, newStage)
        } else if (item.kind === 'quote_request') {
          // Cross-table promote. No undo (un-converting isn't supported).
          await promoteQrThenSetStage(item, newStage)
          return
        } else {
          throw new Error('Cannot move a job back to inquiry stage. Use Archive instead.')
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not change stage', 'error')
        return
      }

      // C3: undo toast on successful same-table moves
      if (!opts.skipUndo) {
        const label = STAGE_META[newStage].label
        toast(`Moved to ${label}`, 'success', {
          label: 'Undo',
          onClick: () => {
            const current = itemsRef.current.find((i) => i.id === item.id && i.kind === item.kind)
            if (!current) return
            saveStage(current, prevStage, { skipUndo: true }).catch((err) => {
              toast(err instanceof Error ? err.message : 'Undo failed', 'error')
            })
          },
        })
      }
    },
    [saveStageQrToQr, saveStageJobToJob, promoteQrThenSetStage],
  )

  // ── Notes ────────────────────────────────────────────────────────

  const saveNotes = useCallback(
    async (item: PipelineItem, newValue: string | null) => {
      const path = item.kind === 'quote_request' ? `/api/leads/${item.id}` : `/api/jobs/${item.id}`
      await optimisticPatch(item, { notes: newValue }, path, { notes: newValue })
    },
    [optimisticPatch],
  )

  // ── Mark contacted now ───────────────────────────────────────────

  const markContactedNow = useCallback(
    async (item: PipelineItem) => {
      const targetQrId = item.kind === 'quote_request' ? item.id : item.linked_quote_request_id
      if (!targetQrId) { toast('No editable lead record for this row', 'error'); return }
      const now = new Date().toISOString()
      const prev = { last_contact_at: item.last_contact_at }
      updateItemLocally(item.id, item.kind, { last_contact_at: now })
      const res = await fetch(`/api/leads/${targetQrId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ last_contact_at: now }),
      })
      if (!res.ok) {
        updateItemLocally(item.id, item.kind, prev)
        toast('Failed to mark contacted', 'error')
        return
      }
      toast('Marked contacted just now', 'success')
    },
    [updateItemLocally],
  )

  // ── Archive (QR-only) ────────────────────────────────────────────

  const archiveLead = useCallback(
    async (item: PipelineItem) => {
      if (item.kind !== 'quote_request') return
      if (!(await confirmDialog({
        title: `Archive ${item.client_name}'s inquiry?`,
        message: "They'll move out of the active pipeline.",
        confirmLabel: 'Archive',
      }))) return
      setItems((prev) => prev.filter((i) => !(i.id === item.id && i.kind === 'quote_request')))
      const res = await fetch(`/api/leads/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      })
      if (!res.ok) { toast('Failed to archive — refresh to recover', 'error'); return }
      toast('Archived', 'success')
    },
    [setItems],
  )

  // ── Cancel / remove from pipeline (soft, recoverable) ────────────
  // Jobs → status 'cancelled', quote_requests → status 'archived'. Both drop
  // out of the pipeline (see /api/pipeline filters) but the record survives,
  // so an Undo toast can put it right back. Mirrors archiveLead but works for
  // both kinds and is reachable from the stage picker + the "..." menu.
  const cancelItem = useCallback(
    async (item: PipelineItem) => {
      const prevStage = item.stage
      const endpoint = item.kind === 'job' ? `/api/jobs/${item.id}` : `/api/leads/${item.id}`
      const cancelStatus = item.kind === 'job' ? 'cancelled' : 'archived'
      // Optimistic removal
      setItems((prev) => prev.filter((i) => !(i.id === item.id && i.kind === item.kind)))
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: cancelStatus }),
      })
      if (!res.ok) {
        await loadPipeline()
        toast('Could not cancel — refreshed', 'error')
        return
      }
      toast(item.kind === 'job' ? 'Job cancelled' : 'Lead archived', 'success', {
        label: 'Undo',
        onClick: () => {
          // Restore the prior status, then refetch so the row reappears.
          const restoreStatus =
            item.kind === 'job' ? (jobStatusForStage(prevStage) ?? 'quoted') : 'new'
          fetch(endpoint, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: restoreStatus }),
          })
            .then((r) => {
              if (!r.ok) throw new Error('Undo failed')
              return loadPipeline()
            })
            .catch((err) => toast(err instanceof Error ? err.message : 'Undo failed', 'error'))
        },
      })
    },
    [setItems, loadPipeline],
  )

  // ── Mark as lost (job-only; soft, recoverable, captures a reason) ─
  // The job equivalent of the QR "Archive (lost)". Customer passed on the
  // quote → status 'cancelled' (drops out of the pipeline, same as cancelItem)
  // but we also prompt for + store a lost_reason for win/loss tracking. Undo
  // restores the prior stage and clears the reason.
  const markLost = useCallback(
    async (item: PipelineItem) => {
      if (item.kind !== 'job') return
      const reason = window.prompt(
        `Mark ${item.project_name} as lost.\nWhy did we lose it? (price, timeline, scope, went with someone else…)`,
      )
      if (reason === null) return // prompt cancelled — do nothing
      const prevStage = item.stage
      setItems((prev) => prev.filter((i) => !(i.id === item.id && i.kind === 'job')))
      const res = await fetch(`/api/jobs/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', lost_reason: reason.trim() || null }),
      })
      if (!res.ok) {
        await loadPipeline()
        toast('Could not mark lost — refreshed', 'error')
        return
      }
      toast('Marked as lost', 'success', {
        label: 'Undo',
        onClick: () => {
          const restoreStatus = jobStatusForStage(prevStage) ?? 'quoted'
          fetch(`/api/jobs/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: restoreStatus, lost_reason: null }),
          })
            .then((r) => {
              if (!r.ok) throw new Error('Undo failed')
              return loadPipeline()
            })
            .catch((err) => toast(err instanceof Error ? err.message : 'Undo failed', 'error'))
        },
      })
    },
    [setItems, loadPipeline],
  )

  // ── Delete forever (hard, NOT recoverable) ───────────────────────
  // Mirrors cancelItem's optimistic-removal + reload-on-error shape, but
  // hits the DELETE verb instead of a status PATCH and offers no Undo —
  // the record is gone. Jobs send force:true so a paid / estimate-sent job
  // still deletes in one tap (the /api/jobs guard otherwise 409s).
  const deleteItem = useCallback(
    async (item: PipelineItem) => {
      if (!(await confirmDialog({
        title: `Delete ${item.project_name} forever?`,
        message: "This can't be undone.",
        tone: 'danger',
        confirmLabel: 'Delete forever',
      }))) return
      const endpoint = item.kind === 'job' ? `/api/jobs/${item.id}` : `/api/leads/${item.id}`
      // Optimistic removal
      setItems((prev) => prev.filter((i) => !(i.id === item.id && i.kind === item.kind)))
      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: item.kind === 'job' ? JSON.stringify({ force: true }) : undefined,
      })
      if (!res.ok) {
        await loadPipeline()
        toast('Could not delete — refreshed', 'error')
        return
      }
      toast('Deleted permanently', 'success')
    },
    [setItems, loadPipeline],
  )

  // ── Customer accepted → Jobs (job-only) ──────────────────────────

  const sendToJobs = useCallback(
    async (item: PipelineItem) => {
      if (item.kind !== 'job') return
      if (!(await confirmDialog({
        title: `Mark ${item.project_name} as accepted?`,
        message: 'This moves it to the operations workflow.',
        confirmLabel: 'Accept',
      }))) return
      setItems((prev) => prev.filter((i) => !(i.id === item.id && i.kind === 'job')))
      const res = await fetch(`/api/jobs/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'accepted_not_scheduled' }),
      })
      if (!res.ok) { toast('Failed to advance — refresh to recover', 'error'); return }
      toast('Sent to Jobs', 'success')
      router.push(`/dashboard/leads/${item.id}`)
    },
    [setItems, router],
  )

  // ── Convert (manual; QR-only). Different from saveStage's cross-table
  //    promote because this navigates to the new job page instead of
  //    refetching the pipeline. ────────────────────────────────────

  const convertLead = useCallback(
    async (item: PipelineItem) => {
      if (item.kind !== 'quote_request') return
      try {
        const res = await fetch(`/api/leads/${item.id}/convert`, { method: 'POST' })
        const data = await res.json()
        if (!res.ok) {
          if (res.status === 409 && data.existing_job_id) {
            toast('Lead already converted — opening job', 'success')
            router.push(`/dashboard/leads/${data.existing_job_id}`)
            return
          }
          throw new Error(data.error || 'Failed to convert')
        }
        toast('Job created — pick a template, use Claude, or edit line items', 'success')
        router.push(`/dashboard/leads/${data.job.id}`)
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Conversion failed', 'error')
      }
    },
    [router],
  )

  // ── Sheet-driven flows ───────────────────────────────────────────

  const scheduleVisit = useCallback(
    async (item: PipelineItem, isoAt: string, notes: string | null) => {
      const targetQrId = item.kind === 'quote_request' ? item.id : item.linked_quote_request_id
      if (!targetQrId) throw new Error('No editable lead record for this row')
      await optimisticPatch(
        item,
        { site_visit_at: isoAt, site_visit_notes: notes, stage: 'in_person_estimate_scheduled' },
        `/api/leads/${targetQrId}`,
        { site_visit_at: isoAt, site_visit_notes: notes },
      )
    },
    [optimisticPatch],
  )

  const pickFollowup = useCallback(
    async (item: PipelineItem, date: string | null) => {
      const targetQrId = item.kind === 'quote_request' ? item.id : item.linked_quote_request_id
      if (!targetQrId) throw new Error('No editable lead record for this row')
      await optimisticPatch(
        item,
        { next_follow_up: date },
        `/api/leads/${targetQrId}`,
        { next_follow_up: date },
      )
    },
    [optimisticPatch],
  )

  // Generates the estimate link and opens the share sheet with it.
  // POST/PATCH side-effect: the endpoint flips the job to 'quoted' on
  // first call, so we refetch to keep the stage chip honest.
  const openShareEstimate = useCallback(
    async (item: PipelineItem) => {
      if (item.kind !== 'job') {
        toast('Convert this lead to a job first', 'error')
        return
      }
      try {
        const res = await fetch(`/api/jobs/${item.id}/estimate-link`, { method: 'POST' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to generate link')
        setSheet({ mode: 'share-estimate', item, url: data.url })
        await loadPipeline()
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not generate link', 'error')
      }
    },
    [loadPipeline],
  )

  const handlers: LeadCardHandlers = {
    saveStage,
    saveNotes,
    markContactedNow,
    archiveLead,
    cancelItem,
    markLost,
    deleteItem,
    convertLead,
    sendToJobs,
    openScheduleVisit: (item) => setSheet({ mode: 'schedule-visit', item }),
    openShareEstimate,
    openPickFollowup: (item) => setSheet({ mode: 'pick-followup', item }),
    stageOptionsFor,
  }

  return {
    handlers,
    sheet,
    closeSheet: () => setSheet(null),
    scheduleVisit,
    pickFollowup,
  }
}
