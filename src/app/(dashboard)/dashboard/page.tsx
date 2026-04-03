import Link from 'next/link'
import { Plus, DollarSign } from 'lucide-react'
import { isDemoMode, demoJobs, demoProfile, demoTeamMembers, demoInvoices } from '@/lib/demo'
import type { Job, Profile, JobWithAssignee, Invoice, QuoteRequest } from '@/lib/supabase/types'
import RevenueCards from '@/components/dashboard/RevenueCards'
import AlertBanners from '@/components/dashboard/AlertBanners'
import ActiveJobsKanban from '@/components/dashboard/ActiveJobsKanban'
import CrewWorkload from '@/components/dashboard/CrewWorkload'
import UnpaidJobs from '@/components/dashboard/UnpaidJobs'

export default async function DashboardOverview() {
  let isOwner = true
  let jobList: JobWithAssignee[] = []
  let invoices: Invoice[] = []
  let leads: QuoteRequest[] = []
  let team: Profile[] = []

  if (isDemoMode) {
    jobList = demoJobs
    invoices = demoInvoices.map((inv) => ({ ...inv }))
    team = demoTeamMembers
    // Demo leads
    leads = [
      {
        id: 'demo-lead-1',
        status: 'new',
        customer_id: null,
        client_name: 'Sarah Johnson',
        client_email: 'sarah@example.com',
        client_phone: '(617) 555-0142',
        project_type: 'bathroom',
        answers: {},
        converted_job_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'demo-lead-2',
        status: 'new',
        customer_id: null,
        client_name: 'James Wilson',
        client_email: 'jwilson@example.com',
        client_phone: '(781) 555-0298',
        project_type: 'shower',
        answers: {},
        converted_job_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
  } else {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user!.id)
      .single()

    const profile = profileData as Profile
    isOwner = profile.role === 'owner'

    // Fetch all data in parallel
    const [jobsResult, invoicesResult, leadsResult, teamResult] = await Promise.all([
      supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('quote_requests')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true)
        .order('full_name'),
    ])

    const rawJobs = (jobsResult.data ?? []) as Job[]
    const assigneeIds = Array.from(new Set(rawJobs.map((j) => j.assigned_to).filter(Boolean))) as string[]
    let assigneeMap: Record<string, Profile> = {}

    if (assigneeIds.length > 0) {
      const { data: assignees } = await supabase
        .from('profiles')
        .select('*')
        .in('id', assigneeIds)
      for (const a of (assignees ?? []) as Profile[]) {
        assigneeMap[a.id] = a
      }
    }

    jobList = rawJobs.map((job) => ({
      ...job,
      assignee: job.assigned_to ? assigneeMap[job.assigned_to] ?? null : null,
    }))

    invoices = (invoicesResult.data ?? []) as Invoice[]
    leads = (leadsResult.data ?? []) as QuoteRequest[]
    team = (teamResult.data ?? []) as Profile[]
  }

  return (
    <div>
      {/* Header with CTAs */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex gap-3">
          {isOwner && (
            <Link
              href="/dashboard/jobs/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Job
            </Link>
          )}
        </div>
      </div>

      {isDemoMode && (
        <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 p-3">
          <p className="text-sm text-amber-800">
            <strong>Demo Mode</strong> — Viewing sample data. Connect Supabase for live data.
          </p>
        </div>
      )}

      {/* Revenue Cards */}
      <div className="mb-6">
        <RevenueCards jobs={jobList} invoices={invoices} />
      </div>

      {/* Alert Banners */}
      <div className="mb-6">
        <AlertBanners jobs={jobList} invoices={invoices} leads={leads} />
      </div>

      {/* Active Jobs Mini-Kanban */}
      <div className="mb-6">
        <ActiveJobsKanban jobs={jobList} />
      </div>

      {/* Bottom row: Crew Workload + Unpaid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CrewWorkload jobs={jobList} team={team} />
        <UnpaidJobs invoices={invoices} jobs={jobList} />
      </div>
    </div>
  )
}
