"use client"

import { useState } from "react"
import { formatCurrency, formatDateShort } from "@/lib/utils"

interface Point {
  date: string
  revenue: number
}

const SERIES_COLOR = "#F97316"
const WIDTH = 600
const HEIGHT = 220
const PAD = { top: 16, right: 12, bottom: 24, left: 12 }

export function RevenueTrendChart({ data }: { data: Point[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const max = Math.max(1, ...data.map((d) => d.revenue))
  const innerW = WIDTH - PAD.left - PAD.right
  const innerH = HEIGHT - PAD.top - PAD.bottom

  const x = (i: number) => PAD.left + (i / Math.max(1, data.length - 1)) * innerW
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d.revenue)}`).join(" ")
  const areaPath = `${linePath} L ${x(data.length - 1)} ${PAD.top + innerH} L ${x(0)} ${PAD.top + innerH} Z`

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
  const hovered = hoverIndex !== null ? data[hoverIndex] : null

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-[220px]" preserveAspectRatio="none">
        {gridLines.map((g) => (
          <line
            key={g}
            x1={PAD.left} x2={WIDTH - PAD.right}
            y1={PAD.top + innerH * (1 - g)} y2={PAD.top + innerH * (1 - g)}
            stroke="rgba(255,255,255,0.08)" strokeWidth={1}
          />
        ))}

        <path d={areaPath} fill={SERIES_COLOR} opacity={0.1} stroke="none" />
        <path d={linePath} fill="none" stroke={SERIES_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {hoverIndex !== null && (
          <line
            x1={x(hoverIndex)} x2={x(hoverIndex)}
            y1={PAD.top} y2={PAD.top + innerH}
            stroke="rgba(255,255,255,0.25)" strokeWidth={1}
          />
        )}

        {data.map((d, i) => (
          <circle
            key={d.date}
            cx={x(i)} cy={y(d.revenue)} r={hoverIndex === i ? 5 : 0}
            fill={SERIES_COLOR} stroke="#0f1f3d" strokeWidth={2}
          />
        ))}

        {/* Transparent hit targets, >=24px equivalent in viewBox units */}
        {data.map((d, i) => (
          <rect
            key={`hit-${d.date}`}
            x={x(i) - innerW / data.length / 2} y={PAD.top}
            width={innerW / data.length} height={innerH}
            fill="transparent"
            onMouseEnter={() => setHoverIndex(i)}
            onMouseLeave={() => setHoverIndex(null)}
          />
        ))}
      </svg>

      {hovered && (
        <div
          className="absolute top-0 pointer-events-none bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(x(hoverIndex!) / WIDTH) * 100}%`,
            transform: hoverIndex! > data.length / 2 ? "translateX(-100%)" : "translateX(0)",
          }}
        >
          <div className="text-white font-bold">{formatCurrency(hovered.revenue)}</div>
          <div className="text-slate-400">{formatDateShort(hovered.date)}</div>
        </div>
      )}
    </div>
  )
}
