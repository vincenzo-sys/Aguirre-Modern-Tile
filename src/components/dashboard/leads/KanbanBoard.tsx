'use client'

// Desktop kanban view of the pipeline — one column per stage,
// LeadCards rendered in compact mode. Cards are draggable; drop on a
// different column calls saveStage. Native HTML5 drag (no DnD lib) —
// works great on desktop; cards keep the inline stage dropdown for
// touch users where drag is awkward.
//
// The terminal 'completed' column collapses to a slim rail by default
// (persisted, shared with the mobile StageList) so finished deals never
// crowd out active work — click to expand, and it stays a drop target
// while collapsed so drag-to-complete still works.

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { PipelineItem, PipelineStage } from '@/app/api/pipeline/route'
import LeadCard, { type LeadCardHandlers } from '@/components/dashboard/LeadCard'
import { STAGE_ORDER, STAGE_META, isQrStage } from '@/lib/leadStages'
import { useLocalStorageState } from '@/lib/useLocalStorageState'
import { formatMoneyShort } from './formatters'

// Custom MIME tells the drop handler that the drag payload is one of
// our cards (not arbitrary text or files). Used to filter dragover.
const DRAG_MIME = 'application/x-lead-card'

export default function KanbanBoard({
  items, handlers, focusedStage,
}: {
  items: PipelineItem[]
  handlers: LeadCardHandlers
  focusedStage?: PipelineStage | null
}) {
  const byStage = new Map<PipelineStage, PipelineItem[]>()
  for (const s of STAGE_ORDER) byStage.set(s, [])
  for (const it of items) byStage.get(it.stage)?.push(it)

  // Highlighted column on dragover. Null when no card is being dragged.
  const [hoverStage, setHoverStage] = useState<PipelineStage | null>(null)
  // Terminal 'completed' column starts collapsed; the choice persists and is
  // shared with the mobile StageList section.
  const [completedOpen, setCompletedOpen] = useLocalStorageState<boolean>(
    'leads_completed_open_v1', false, (v): v is boolean => typeof v === 'boolean',
  )

  function decode(e: React.DragEvent): { id: string; kind: 'quote_request' | 'job' } | null {
    try {
      const raw = e.dataTransfer.getData(DRAG_MIME)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (typeof parsed?.id === 'string' && (parsed?.kind === 'quote_request' || parsed?.kind === 'job')) {
        return parsed
      }
      return null
    } catch { return null }
  }

  // Drop semantics:
  //   - Same column = no-op
  //   - Job → QR-stage = silently refused (would require un-converting)
  //   - Everything else routes through saveStage, which handles
  //     QR→QR, job→job, and the QR→job auto-promote case.
  async function handleDrop(targetStage: PipelineStage, e: React.DragEvent) {
    e.preventDefault()
    setHoverStage(null)
    const payload = decode(e)
    if (!payload) return
    const item = items.find((i) => i.id === payload.id && i.kind === payload.kind)
    if (!item) return
    if (item.stage === targetStage) return
    if (item.kind === 'job' && isQrStage(targetStage)) return  // backward — skip silently
    try { await handlers.saveStage(item, targetStage) }
    catch { /* saveStage surfaces its own toast on failure */ }
  }

  // Shared drag-target handlers so the collapsed rail and full columns
  // behave identically. dragover only reacts to our own card payload.
  function onColumnDragOver(stage: PipelineStage, e: React.DragEvent) {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return
    e.preventDefault()  // required to allow drop
    e.dataTransfer.dropEffect = 'move'
    if (hoverStage !== stage) setHoverStage(stage)
  }
  function onColumnDragLeave(stage: PipelineStage, e: React.DragEvent) {
    // dragleave fires on every internal element; only clear when leaving
    // the column itself.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    if (hoverStage === stage) setHoverStage(null)
  }

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0 pb-4">
      <div className="flex gap-3 px-4 sm:px-0 min-w-min">
        {STAGE_ORDER.map((stage) => {
          const cards = byStage.get(stage) ?? []
          const dollars = cards.reduce((sum, c) => sum + (c.estimated_cost ?? 0), 0)
          const meta = STAGE_META[stage]
          const Icon = meta.icon
          const isFocused = focusedStage === stage
          const isDropTarget = hoverStage === stage

          // Collapsed terminal column → slim vertical rail. Still a drop
          // target, so you can drag a Scheduled card onto it to complete.
          if (stage === 'completed' && !completedOpen) {
            return (
              <div
                key={stage}
                onDragOver={(e) => onColumnDragOver(stage, e)}
                onDragLeave={(e) => onColumnDragLeave(stage, e)}
                onDrop={(e) => handleDrop(stage, e)}
                className={`flex-shrink-0 w-12 bg-gray-50 rounded-xl border border-gray-200 border-t-4 ${meta.topBorder} transition ${
                  isDropTarget ? 'ring-2 ring-primary-500 bg-primary-50/50' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => setCompletedOpen(true)}
                  title="Show completed"
                  aria-label={`Show completed (${cards.length})`}
                  className="w-full flex flex-col items-center gap-2 py-3 text-gray-500 hover:text-gray-800"
                >
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md ${meta.iconSolid}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                    {cards.length}
                  </span>
                  <span className="text-[11px] font-semibold tracking-wide [writing-mode:vertical-rl] rotate-180">
                    Completed
                  </span>
                </button>
              </div>
            )
          }

          return (
            <div
              key={stage}
              ref={(el) => {
                if (isFocused && el) {
                  el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
                }
              }}
              onDragOver={(e) => onColumnDragOver(stage, e)}
              onDragLeave={(e) => onColumnDragLeave(stage, e)}
              onDrop={(e) => handleDrop(stage, e)}
              className={`flex-shrink-0 w-[248px] bg-gray-50 rounded-xl border border-gray-200 border-t-4 ${meta.topBorder} transition ${
                isFocused ? 'ring-2 ring-primary-400' : ''
              } ${isDropTarget ? 'ring-2 ring-primary-500 bg-primary-50/50' : ''}`}
            >
              {/* Sticky column header — full tinted band so the stage reads at a
                  glance even when the column is half-scrolled off screen. */}
              <div className={`sticky top-0 ${meta.headerBar} rounded-t-xl px-3 py-2.5 border-b border-gray-200`}>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0 ${meta.iconSolid}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className={`text-sm font-bold flex-1 leading-tight line-clamp-2 ${meta.headerText}`}>{meta.label}</span>
                  <span className="text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-full px-2 py-0.5 flex-shrink-0">
                    {cards.length}
                  </span>
                  {stage === 'completed' && (
                    <button
                      type="button"
                      onClick={() => setCompletedOpen(false)}
                      title="Hide completed"
                      aria-label="Collapse completed column"
                      className="p-0.5 -mr-1 text-gray-400 hover:text-gray-700"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {dollars > 0 && (
                  <div className="mt-1 text-[11px] text-gray-500">{formatMoneyShort(dollars)} in stage</div>
                )}
              </div>

              {/* Card list */}
              <div className="p-2 space-y-2 min-h-[60px]">
                {cards.length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic text-center py-6">
                    {isDropTarget ? 'Drop here' : 'Empty'}
                  </p>
                ) : (
                  cards.map((item) => (
                    <LeadCard
                      key={`${item.kind}-${item.id}`}
                      item={item}
                      handlers={handlers}
                      compact
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
