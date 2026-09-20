"use client"

import { useState } from "react"

interface Segment {
  serviceType: string
  label: string
  count: number
}

// Validated dark-mode categorical order (CVD-safe adjacent pairs). Beyond 8
// slots, remaining categories fold into a neutral "Other" bucket.
const CATEGORICAL_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"]
const OTHER_COLOR = "#6b7280"
const MAX_SLICES = 8

export function ServiceBreakdownChart({ data }: { data: Segment[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const total = data.reduce((sum, d) => sum + d.count, 0)

  const top = data.slice(0, MAX_SLICES)
  const rest = data.slice(MAX_SLICES)
  const otherCount = rest.reduce((sum, d) => sum + d.count, 0)
  const slices = otherCount > 0 ? [...top, { serviceType: "OTHER", label: "Other", count: otherCount }] : top
  const colors = slices.map((_, i) => (i < CATEGORICAL_DARK.length ? CATEGORICAL_DARK[i] : OTHER_COLOR))

  if (total === 0) {
    return <p className="text-slate-500 text-sm text-center py-10">No bookings yet to break down.</p>
  }

  const radius = 60
  const cx = 70
  const cy = 70
  const strokeWidth = 26

  const circumference = 2 * Math.PI * radius
  const { arcs } = slices.reduce<{ arcs: (Segment & { color: string; dash: number; gap: number; offset: number; pct: number })[]; cumulative: number }>(
    (acc, s, i) => {
      const fraction = s.count / total
      const startAngle = acc.cumulative * 2 * Math.PI
      const cumulative = acc.cumulative + fraction
      const dash = fraction * circumference
      const gap = circumference - dash
      // Rotate so each arc starts at the right offset; SVG stroke-dasharray trick
      const offset = -((startAngle / (2 * Math.PI)) * circumference)
      const arc = { ...s, color: colors[i], dash, gap, offset, pct: Math.round(fraction * 100) }
      return { arcs: [...acc.arcs, arc], cumulative }
    },
    { arcs: [], cumulative: 0 }
  )

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <div className="relative flex-shrink-0">
        <svg viewBox="0 0 140 140" className="w-40 h-40 -rotate-90">
          {arcs.map((a, i) => (
            <circle
              key={a.serviceType}
              cx={cx} cy={cy} r={radius}
              fill="none"
              stroke={a.color}
              strokeWidth={hoverIndex === i ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={`${a.dash} ${a.gap}`}
              strokeDashoffset={a.offset}
              opacity={hoverIndex === null || hoverIndex === i ? 1 : 0.4}
              style={{ transition: "stroke-width 150ms, opacity 150ms" }}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-black text-white">{hoverIndex !== null ? arcs[hoverIndex].count : total}</span>
          <span className="text-[10px] text-slate-400 uppercase tracking-wide">
            {hoverIndex !== null ? `${arcs[hoverIndex].pct}%` : "Total"}
          </span>
        </div>
      </div>

      <div className="flex-1 min-w-[160px] space-y-2">
        {arcs.map((a, i) => (
          <div
            key={a.serviceType}
            className="flex items-center gap-2 text-sm cursor-pointer"
            onMouseEnter={() => setHoverIndex(i)}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: a.color }} />
            <span className="text-slate-300 flex-1 truncate">{a.label}</span>
            <span className="text-slate-500 text-xs">{a.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
