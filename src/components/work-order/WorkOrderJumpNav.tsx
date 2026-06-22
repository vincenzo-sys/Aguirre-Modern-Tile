// Sticky jump bar so the crew can skip a long materials list to reach Hours /
// Scope without scrolling the whole sheet. Plain anchor links — no JS — so the
// page stays server-rendered. Sticks to the top under the header; styled dark
// to read as a continuation of the header. Only renders chips for sections
// that are actually present.

type Chip = { id: string; label: string; show: boolean }

export default function WorkOrderJumpNav({
  hasSchedule,
  hasPhotos,
  hasScope,
}: {
  hasSchedule: boolean
  hasPhotos: boolean
  hasScope: boolean
}) {
  const chips: Chip[] = [
    { id: 'schedule', label: 'Schedule', show: hasSchedule },
    { id: 'site', label: 'Site', show: true },
    { id: 'photos', label: 'Photos', show: hasPhotos },
    { id: 'materials', label: 'Materials', show: true },
    { id: 'hours', label: 'Hours', show: true },
    { id: 'scope', label: 'Scope', show: hasScope },
  ]
  const visible = chips.filter((c) => c.show)
  if (visible.length <= 2) return null

  return (
    <nav
      aria-label="Jump to section"
      className="sticky top-0 z-30 bg-gray-900 border-t border-gray-800"
    >
      <div className="max-w-2xl mx-auto flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visible.map((c) => (
          <a
            key={c.id}
            href={`#${c.id}`}
            className="shrink-0 inline-flex items-center min-h-[36px] px-3 rounded-full text-sm font-medium text-gray-200 bg-white/10 hover:bg-white/20 active:scale-95 transition whitespace-nowrap"
          >
            {c.label}
          </a>
        ))}
      </div>
    </nav>
  )
}
