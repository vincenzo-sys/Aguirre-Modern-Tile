import type { JobStatus } from '@/lib/supabase/types'

const statusTabs: { value: string; statuses: JobStatus[] }[] = [
  { value: 'all', statuses: [] },
  { value: 'leads', statuses: ['lead'] },
  { value: 'quoted', statuses: ['quoted'] },
  { value: 'scheduled', statuses: ['scheduled'] },
  { value: 'active', statuses: ['in_progress', 'waiting_for_materials'] },
  { value: 'completed', statuses: ['completed'] },
  { value: 'paid', statuses: ['paid'] },
  { value: 'cancelled', statuses: ['cancelled'] },
]

export function filterJobs(
  jobs: { status: string; job_type: string | null; title: string; client_name: string }[],
  statusFilter: string,
  typeFilter: string,
  searchFilter: string,
) {
  let filtered = [...jobs]

  const tab = statusTabs.find((t) => t.value === statusFilter)
  if (tab && tab.statuses.length > 0) {
    filtered = filtered.filter((j) => tab.statuses.includes(j.status as JobStatus))
  }

  if (typeFilter) {
    filtered = filtered.filter((j) => j.job_type === typeFilter)
  }

  if (searchFilter) {
    const q = searchFilter.toLowerCase()
    filtered = filtered.filter((j) =>
      (j.title ?? '').toLowerCase().includes(q) ||
      (j.client_name ?? '').toLowerCase().includes(q)
    )
  }

  return filtered
}
