import LeadWorkspace from '@/components/dashboard/leads/LeadWorkspace'
import JobOperationsDetail from '@/components/dashboard/jobs/JobOperationsDetail'
import { shouldUseDemoData } from '@/lib/useDemoFallback'
import { getDemoJob } from '@/lib/demo'

// Unified deal detail. This one URL carries a deal from first inquiry all the
// way to paid — there is no separate Jobs section anymore.
//
// The page is a thin server wrapper that picks the workspace by status:
//   • sales stages (un-converted inquiry, lead/quoted/estimate_revised)
//        → <LeadWorkspace>  (estimate builder, materials, crew link, scope)
//   • operations stages (accepted → paid)
//        → <JobOperationsDetail>  (scheduling, crew, labor, payment, invoices)
//
// Because both live at the same URL, the client workspace can flip a deal into
// operations with router.refresh() (which re-runs this wrapper) instead of
// navigating away — so the materials editor is never lost mid-lifecycle.
const OPERATIONS_STATUSES = new Set<string>([
  'accepted_not_scheduled',
  'scheduled',
  'in_progress',
  'waiting_for_materials',
  'completed',
  'paid',
  'cancelled',
])

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Resolve the route id (which may be a quote_request id OR a job id) to a
  // concrete job + status, so we can choose the workspace. Only a post-lead
  // job routes to the operations detail; everything else falls through to the
  // sales workspace (which already knows how to load a QR or a lead-stage job).
  let opsJobId: string | null = null

  // Viewer role gate for the sales workspace. Defaults to owner (demo +
  // auth-edge) and is narrowed to the fetched profile's role, mirroring the
  // isOwner resolution in JobOperationsDetail (profile.role === 'owner').
  // Passed to LeadWorkspace so crew never see cost/profit/margin or the
  // price-edit + Send controls.
  let isOwner = true

  const useDemo = await shouldUseDemoData()
  if (useDemo) {
    const demoJob = getDemoJob(id)
    if (demoJob && OPERATIONS_STATUSES.has(demoJob.status)) {
      opsJobId = demoJob.id
    }
  } else {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (profileData) {
        isOwner = (profileData as { role: string }).role === 'owner'
      }
    }

    // Try the id as a job first.
    const { data: jobRow } = await supabase
      .from('jobs')
      .select('id, status')
      .eq('id', id)
      .maybeSingle()

    let resolved = jobRow as { id: string; status: string } | null

    // Not a job id? It may be a quote_request id whose converted job has moved
    // to operations. (Un-converted QRs and lead-stage jobs fall through.)
    if (!resolved) {
      const { data: qr } = await supabase
        .from('quote_requests')
        .select('converted_job_id')
        .eq('id', id)
        .maybeSingle()
      if (qr?.converted_job_id) {
        const { data: convJob } = await supabase
          .from('jobs')
          .select('id, status')
          .eq('id', qr.converted_job_id)
          .maybeSingle()
        resolved = convJob as { id: string; status: string } | null
      }
    }

    if (resolved && OPERATIONS_STATUSES.has(resolved.status)) {
      opsJobId = resolved.id
    }
  }

  if (opsJobId) {
    return <JobOperationsDetail id={opsJobId} />
  }
  return <LeadWorkspace id={id} isOwner={isOwner} />
}
