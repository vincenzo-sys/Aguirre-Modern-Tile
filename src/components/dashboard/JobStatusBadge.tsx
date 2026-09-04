import { jobStatusMeta } from '@/lib/jobStatus'

// `status` is deliberately a plain string. It almost always arrives straight
// off a Supabase row, and the job_status enum in Postgres is allowed to grow
// past the TypeScript union (it already had, with awaiting_response). See
// src/lib/jobStatus.ts — unmapped values render gray rather than throwing.
export default function JobStatusBadge({ status }: { status: string }) {
  const { label, badge } = jobStatusMeta(status)
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge}`}>
      {label}
    </span>
  )
}
