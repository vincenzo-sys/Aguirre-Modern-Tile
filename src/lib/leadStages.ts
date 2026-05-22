// Single source of truth for everything stage-related on the leads
// pipeline. Before this module, stage label/color/icon was defined in
// three places (page.tsx, PipelineSummaryStrip, KanbanBoard) and drift
// between them was a live risk every time a stage was added or recolored.
//
// Anything visual or behavioral that depends on the stage enum lives
// here. Components import what they need by name.

import {
  Inbox, FileText, Calendar, FilePlus, FileCheck,
  type LucideIcon,
} from 'lucide-react'
import type { PipelineStage } from '@/app/api/pipeline/route'
import type { StageOption } from '@/components/dashboard/InlineEditCells'

export type { PipelineStage }

// Canonical left-to-right order. Used by the summary strip, kanban
// columns, the EditableStageCell dropdown, and anywhere else stages
// are enumerated.
export const STAGE_ORDER: PipelineStage[] = [
  'new', 'reviewed', 'visit_scheduled',
  'lead_in_progress', 'estimate_sent', 'estimate_revised',
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
    label: 'New inquiry', shortLabel: 'New',
    chip: 'bg-blue-100 text-blue-700',
    topBorder: 'border-t-blue-400',
    iconBg: 'bg-blue-100 text-blue-700',
    icon: Inbox,
  },
  reviewed: {
    label: 'Reviewed', shortLabel: 'Reviewed',
    chip: 'bg-yellow-100 text-yellow-800',
    topBorder: 'border-t-yellow-400',
    iconBg: 'bg-yellow-100 text-yellow-800',
    icon: FileText,
  },
  visit_scheduled: {
    label: 'Visit scheduled', shortLabel: 'Visit',
    chip: 'bg-amber-100 text-amber-800',
    topBorder: 'border-t-amber-400',
    iconBg: 'bg-amber-100 text-amber-800',
    icon: Calendar,
  },
  lead_in_progress: {
    label: 'Active lead', shortLabel: 'Active',
    chip: 'bg-indigo-100 text-indigo-800',
    topBorder: 'border-t-indigo-400',
    iconBg: 'bg-indigo-100 text-indigo-800',
    icon: FileText,
  },
  estimate_sent: {
    label: 'Estimate sent', shortLabel: 'Sent',
    chip: 'bg-purple-100 text-purple-800',
    topBorder: 'border-t-purple-400',
    iconBg: 'bg-purple-100 text-purple-800',
    icon: FilePlus,
  },
  estimate_revised: {
    label: 'Estimate revised', shortLabel: 'Revised',
    chip: 'bg-pink-100 text-pink-800',
    topBorder: 'border-t-pink-400',
    iconBg: 'bg-pink-100 text-pink-800',
    icon: FileCheck,
  },
}

// QR-stages live on quote_requests; job-stages live on jobs. The
// difference matters in saveStage (which table to PATCH) and in
// stageOptionsFor (job rows can't move back to QR stages).
const QR_STAGES = new Set<PipelineStage>(['new', 'reviewed', 'visit_scheduled'])
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
  lead_in_progress: 'lead',
  estimate_sent: 'quoted',
  estimate_revised: 'estimate_revised',
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
