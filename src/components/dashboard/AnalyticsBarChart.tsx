interface Bar {
  label: string
  value: number
  color: string
}

interface AnalyticsBarChartProps {
  bars: Bar[]
  maxValue?: number
}

export default function AnalyticsBarChart({ bars, maxValue }: AnalyticsBarChartProps) {
  const max = maxValue ?? Math.max(...bars.map((b) => b.value), 1)

  return (
    <div className="space-y-3">
      {bars.map((bar) => (
        <div key={bar.label} className="flex items-center gap-3">
          <span className="text-sm text-gray-600 w-28 shrink-0 text-right truncate">{bar.label}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
            <div
              className="h-full rounded-full flex items-center px-2 transition-all"
              style={{ width: `${Math.max((bar.value / max) * 100, 2)}%`, backgroundColor: bar.color }}
            >
              {bar.value > 0 && (
                <span className="text-xs font-medium text-white drop-shadow-sm">{bar.value}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
