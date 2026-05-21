// Pure helper that groups pipeline items into four action-oriented buckets.
// Keeps the leads page declarative — bucketize() is the only place that
// encodes "what does Vince need to look at first."
//
// Bucket rules (in priority order — an item lands in the first bucket it
// matches, never in two):
//
//   1. actionNeeded   urgency >= 90  — overdue follow-up, visit today/yesterday,
//                                       or just-arrived (<24h). Red/orange.
//   2. waiting        stage ∈ {estimate_sent, estimate_revised} AND urgency < 100.
//                     Ball is in customer's court. Blue.
//   3. working        stage ∈ {new, reviewed, visit_scheduled, lead_in_progress}
//                     with urgency < 90. Active work-in-progress. Neutral.
//   4. stale          urgency in {50, 70} — 1+ or 2+ weeks since last contact,
//                     not already in action-needed. Amber.
//
// Items that don't match any bucket (shouldn't happen given the urgency
// scoring, but defensively) get dropped into `working` so they're not lost.

import type { PipelineItem } from '@/app/api/pipeline/route'

export type BucketKey = 'actionNeeded' | 'waiting' | 'working' | 'stale'

export type Buckets = Record<BucketKey, PipelineItem[]>

const QUOTED_STAGES = new Set(['estimate_sent', 'estimate_revised'])
const WORKING_STAGES = new Set(['new', 'reviewed', 'visit_scheduled', 'lead_in_progress'])

export function bucketize(items: PipelineItem[]): Buckets {
  const buckets: Buckets = { actionNeeded: [], waiting: [], working: [], stale: [] }
  for (const item of items) {
    if (item.urgency >= 90) {
      buckets.actionNeeded.push(item)
      continue
    }
    if (QUOTED_STAGES.has(item.stage)) {
      buckets.waiting.push(item)
      continue
    }
    if (item.urgency === 50 || item.urgency === 70) {
      buckets.stale.push(item)
      continue
    }
    if (WORKING_STAGES.has(item.stage)) {
      buckets.working.push(item)
      continue
    }
    buckets.working.push(item)
  }
  return buckets
}

export const BUCKET_META: Record<BucketKey, {
  label: string
  hint: string
  defaultOpen: boolean
  tint: { container: string; iconBg: string; iconText: string; countBg: string }
}> = {
  actionNeeded: {
    label: 'Action needed',
    hint: 'Overdue follow-ups, visits today, fresh inquiries',
    defaultOpen: true,
    tint: {
      container: 'border-red-200',
      iconBg: 'bg-red-50',
      iconText: 'text-red-600',
      countBg: 'bg-red-100 text-red-700',
    },
  },
  working: {
    label: 'Working leads',
    hint: 'Active pipeline — your call to push these forward',
    defaultOpen: true,
    tint: {
      container: 'border-gray-200',
      iconBg: 'bg-blue-50',
      iconText: 'text-blue-600',
      countBg: 'bg-blue-100 text-blue-700',
    },
  },
  waiting: {
    label: 'Waiting on customer',
    hint: 'Estimate sent — ball is in their court',
    defaultOpen: true,
    tint: {
      container: 'border-blue-200',
      iconBg: 'bg-indigo-50',
      iconText: 'text-indigo-600',
      countBg: 'bg-indigo-100 text-indigo-700',
    },
  },
  stale: {
    label: 'Stale',
    hint: 'No contact in 1+ week — decide: nudge or archive',
    defaultOpen: false,
    tint: {
      container: 'border-amber-200',
      iconBg: 'bg-amber-50',
      iconText: 'text-amber-600',
      countBg: 'bg-amber-100 text-amber-700',
    },
  },
}

export const BUCKET_ORDER: BucketKey[] = ['actionNeeded', 'working', 'waiting', 'stale']
