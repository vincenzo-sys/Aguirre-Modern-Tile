// Single source of truth for job status transitions.
//
// Both the desktop dropdown (StatusUpdateDropdown) and the mobile action bar
// (JobMobileActionBar) read from these tables. Each transition has an
// optional `priority` so the mobile bar can pick a "primary positive next"
// status (the one Vince/Christian want 90% of the time) without imposing
// the same ordering on the desktop dropdown menu.

import type { JobStatus } from '@/lib/supabase/types'

export type Transition = {
  label: string
  next: JobStatus
  tone?: 'primary' | 'danger'
  // When true, this is the canonical next-status for the mobile action bar.
  // Exactly zero or one transition per source status should set this.
  primary?: boolean
}

export type Role = 'owner' | 'crew'

// Full status list for the owner's free-choice dropdown (any status, including
// backward moves + cancel). Shared by StatusUpdateDropdown and the leads
// workspace page so the two surfaces never drift. Crew stay on getTransitions.
export const JOB_STATUS_OPTIONS: Array<{ value: JobStatus; label: string }> = [
  { value: 'lead', label: 'Lead' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'estimate_revised', label: 'Estimate revised' },
  { value: 'accepted_not_scheduled', label: 'Accepted — not scheduled' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'waiting_for_materials', label: 'Waiting for materials' },
  { value: 'completed', label: 'Completed' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
]

const ownerTransitions: Partial<Record<JobStatus, Transition[]>> = {
  lead: [
    { label: 'Mark Quoted', next: 'quoted', primary: true },
    { label: 'Cancel job', next: 'cancelled', tone: 'danger' },
  ],
  quoted: [
    { label: 'Schedule Job', next: 'scheduled', primary: true },
    { label: 'Mark revised', next: 'estimate_revised' },
    { label: 'Deposit received', next: 'accepted_not_scheduled' },
    { label: 'Cancel job', next: 'cancelled', tone: 'danger' },
  ],
  estimate_revised: [
    { label: 'Schedule Job', next: 'scheduled', primary: true },
    { label: 'Deposit received', next: 'accepted_not_scheduled' },
    { label: 'Cancel job', next: 'cancelled', tone: 'danger' },
  ],
  accepted_not_scheduled: [
    { label: 'Schedule Job', next: 'scheduled', primary: true },
    { label: 'Cancel job', next: 'cancelled', tone: 'danger' },
  ],
  scheduled: [
    { label: 'Start Work', next: 'in_progress', primary: true },
    { label: 'Cancel job', next: 'cancelled', tone: 'danger' },
  ],
  in_progress: [
    { label: 'Mark Complete', next: 'completed', primary: true },
    { label: 'Waiting for materials', next: 'waiting_for_materials' },
  ],
  waiting_for_materials: [
    { label: 'Resume Work', next: 'in_progress', primary: true },
    { label: 'Mark complete', next: 'completed' },
  ],
  completed: [{ label: 'Mark Paid', next: 'paid', primary: true }],
}

const crewTransitions: Partial<Record<JobStatus, Transition[]>> = {
  scheduled: [{ label: 'Start Work', next: 'in_progress', primary: true }],
  in_progress: [
    { label: 'Mark Complete', next: 'completed', primary: true },
    { label: 'Waiting for materials', next: 'waiting_for_materials' },
  ],
  waiting_for_materials: [
    { label: 'Resume Work', next: 'in_progress', primary: true },
    { label: 'Mark complete', next: 'completed' },
  ],
}

export function getTransitions(role: Role, status: JobStatus): Transition[] {
  const map = role === 'owner' ? ownerTransitions : crewTransitions
  return map[status] ?? []
}

export function getPrimaryTransition(role: Role, status: JobStatus): Transition | undefined {
  return getTransitions(role, status).find((t) => t.primary)
}

export function getSecondaryTransitions(role: Role, status: JobStatus): Transition[] {
  return getTransitions(role, status).filter((t) => !t.primary)
}
