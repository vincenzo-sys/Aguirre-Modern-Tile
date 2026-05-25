// Single source of truth for everything stage-related on the leads
// pipeline. Before this module, stage label/color/icon was defined in
// three places (page.tsx, PipelineSummaryStrip, KanbanBoard) and drift
// between them was a live risk every time a stage was added or recolored.
//
// Anything visual or behavioral that depends on the stage enum lives
// here. Components import what they need by name.

import {
  Inbox, Calendar, FilePlus, FileEdit, Clock, CheckCircle2, CalendarCheck,
  type LucideIcon,
} from 'lucide-react'
import type { PipelineStage } from '@/app/api/pipeline/route'
import type { StageOption } from '@/components/dashboard/InlineEditCells'

export type { PipelineStage }

// Canonical left-to-right order — mirrors the real Aguirre deal flow:
//   inquiry → site-visit booked → estimate out → revisions → chasing →
//   customer said yes (no install date) → install on the calendar.
//
// Each stage represents a distinct "whose turn is it" + "what's the next
// action" combination. Two QR-only stages (new, in_person_estimate_scheduled)
// live on quote_requests; the rest are job-status driven.
export const STAGE_ORDER: PipelineStage[] = [
  'new',
  'in_person_estimate_scheduled',
  'quoted',
  'edits_needed',
  'awaiting_response',
  'accepted_not_scheduled',
  'scheduled',
]

type StageMeta = {
  label: string        // full text for cards, dropdown, kanban header
  shortLabel: string   // tight text for the summary strip
  chip: string         // tailwind classes for the pill chip (bg + text)
  topBorder: string    // tailwind class for the kanban column top accent
  iconBg: string       // tailwind classes for the icon-in-tinted-box
  icon: LucideIcon
}

// One row per stage. Variations (short vs full label) live as columns,
// not parallel records.
export const STAGE_META: Record<PipelineStage, StageMeta> = {
  new: {
    label: 'New', shortLabel: 'New',
    chip: 'bg-blue-100 text-blue-700',
    topBorder: 'border-t-blue-400',
    iconBg: 'bg-blue-100 text-blue-700',
    icon: Inbox,
  },
  in_person_estimate_scheduled: {
    label: 'In-person estimate scheduled', shortLabel: 'Visit',
    chip: 'bg-amber-100 text-amber-800',
    topBorder: 'border-t-amber-400',
    iconBg: 'bg-amber-100 text-amber-800',
    icon: Calendar,
  },
  quoted: {
    label: 'Quoted', shortLabel: 'Quoted',
    chip: 'bg-purple-100 text-purple-800',
    topBorder: 'border-t-purple-400',
    iconBg: 'bg-purple-100 text-purple-800',
    icon: FilePlus,
  },
  edits_needed: {
    label: 'Edits needed', shortLabel: 'Edits',
    chip: 'bg-pink-100 text-pink-800',
    topBorder: 'border-t-pink-400',
    iconBg: 'bg-pink-100 text-pink-800',
    icon: FileEdit,
  },
  awaiting_response: {
    label: 'Waiting for response', shortLabel: 'Waiting',
    chip: 'bg-orange-100 text-orange-800',
    topBorder: 'border-t-orange-400',
    iconBg: 'bg-orange-100 text-orange-800',
    icon: Clock,
  },
  accepted_not_scheduled: {
    label: 'Accepted — waiting to schedule', shortLabel: 'Accepted',
    chip: 'bg-emerald-100 text-emerald-800',
    topBorder: 'border-t-emerald-400',
    iconBg: 'bg-emerald-100 text-emerald-800',
    icon: CheckCircle2,
  },
  scheduled: {
    label: 'Scheduled', shortLabel: 'Scheduled',
    chip: 'bg-teal-100 text-teal-800',
    topBorder: 'border-t-teal-400',
    iconBg: 'bg-teal-100 text-teal-800',
    icon: CalendarCheck,
  },
}

// QR-stages live on quote_requests; job-stages live on jobs. The
// difference matters in saveStage (which table to PATCH) and in
// stageOptionsFor (job rows can't move back to QR stages).
const QR_STAGES = new Set<PipelineStage>(['new', 'in_person_estimate_scheduled'])
export function isQrStage(stage: PipelineStage): boolean {
  return QR_STAGES.has(stage)
}
export function isJobStage(stage: PipelineStage): boolean {
  return !QR_STAGES.has(stage)
}

// PipelineStage → jobs.status value. Returns null for QR-only stages.
// Used by saveStage to translate "set stage to X" into the right
// concrete column write.
const JOB_STATUS_FOR_STAGE: Partial<Record<PipelineStage, string>> = {
  quoted: 'quoted',
  edits_needed: 'estimate_revised',
  awaiting_response: 'awaiting_response',
  accepted_not_scheduled: 'accepted_not_scheduled',
  scheduled: 'scheduled',
}
export function jobStatusForStage(stage: PipelineStage): string | null {
  return JOB_STATUS_FOR_STAGE[stage] ?? null
}

// Builds the EditableStageCell options list for a given row. QR rows
// can pick any stage (job-stages auto-promote via convert endpoint).
// Job rows can only stay in job-stages.
export function stageOptionsFor(item: { kind: 'quote_request' | 'job' }): StageOption<PipelineStage>[] {
  return STAGE_ORDER.map((stage) => {
    const meta = STAGE_META[stage]
    const disabled = item.kind === 'job' && isQrStage(stage)
    return {
      stage,
      label: meta.label,
      color: meta.chip,
      icon: meta.icon,
      disabled,
      disabledReason: disabled
        ? 'Job already created — moving back to an inquiry stage isn’t supported. Use Archive to remove from the pipeline.'
        : undefined,
    }
  })
}
