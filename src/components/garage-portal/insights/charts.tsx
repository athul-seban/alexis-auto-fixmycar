"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

// Small, dependency-free SVG charts. Every colour is a Tailwind class with a dark: variant (the
// admin charts are dark-only), and each datum is also exposed as text so it isn't colour-only.

const W = 640
const H = 240
const PAD = { l: 44, r: 12, t: 12, b: 28 }

/** Round a max up to a "nice" axis ceiling and return evenly spaced ticks. */
export function niceTicks(max: number, count = 4): { ceil: number; ticks: number[] } {
  if (max <= 0) return { ceil: 1, ticks: [0, 1] }
  const raw = max / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const ceil = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= ceil + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100)
  return { ceil, ticks }
}

function XLabels({ labels, x }: { labels: string[]; x: (i: number) => number }) {
  const every = Math.max(1, Math.ceil(labels.length / 8))
  return (
    <>
      {labels.map((l, i) =>
        i % every === 0 ? (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-slate-500 text-[10px] dark:fill-slate-400">
            {l}
          </text>
        ) : null
      )}
    </>
  )
}

function Grid({ ticks, ceil, format }: { ticks: number[]; ceil: number; format: (n: number) => string }) {
  const y = (v: number) => PAD.t + (1 - v / ceil) * (H - PAD.t - PAD.b)
  return (
    <>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-slate-200 dark:stroke-white/10" />
          <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" className="fill-slate-500 text-[10px] dark:fill-slate-400">{format(t)}</text>
        </g>
      ))}
    </>
  )
}

interface BarDatum { label: string; a: number; b: number }

export function BarChart({ data, aLabel, bLabel }: { data: BarDatum[]; aLabel: string; bLabel: string }) {
  const max = Math.max(0, ...data.flatMap((d) => [d.a, d.b]))
  const { ceil, ticks } = niceTicks(max)
  const plotW = W - PAD.l - PAD.r
  const slot = plotW / Math.max(1, data.length)
  const barW = Math.min(18, slot / 2.6)
  const y = (v: number) => PAD.t + (1 - v / ceil) * (H - PAD.t - PAD.b)
  const x = (i: number) => PAD.l + slot * i + slot / 2
  const [hover, setHover] = useState<number | null>(null)

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${aLabel} and ${bLabel} over time`}>
        <Grid ticks={ticks} ceil={ceil} format={(n) => String(n)} />
        {data.map((d, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={PAD.l + slot * i} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} className="fill-transparent" />
            <rect x={x(i) - barW - 1} y={y(d.a)} width={barW} height={H - PAD.b - y(d.a)} rx={2} className="fill-[#1E3A5F] dark:fill-blue-400">
              <title>{`${d.label}: ${d.a} ${aLabel.toLowerCase()}`}</title>
            </rect>
            <rect x={x(i) + 1} y={y(d.b)} width={barW} height={H - PAD.b - y(d.b)} rx={2} className="fill-[#F97316]">
              <title>{`${d.label}: ${d.b} ${bLabel.toLowerCase()}`}</title>
            </rect>
          </g>
        ))}
        <XLabels labels={data.map((d) => d.label)} x={x} />
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#1E3A5F] dark:bg-blue-400" />{aLabel}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#F97316]" />{bLabel}</span>
        {hover !== null && data[hover] && <span className="ml-auto font-medium text-slate-700 dark:text-slate-200">{data[hover].label}: {data[hover].a} / {data[hover].b}</span>}
      </figcaption>
    </figure>
  )
}

interface LineDatum { label: string; value: number }

export function LineAreaChart({ data, format, name }: { data: LineDatum[]; format: (n: number) => string; name: string }) {
  const max = Math.max(0, ...data.map((d) => d.value))
  const { ceil, ticks } = niceTicks(max)
  const plotW = W - PAD.l - PAD.r
  const x = (i: number) => PAD.l + (data.length <= 1 ? plotW / 2 : (plotW * i) / (data.length - 1))
  const y = (v: number) => PAD.t + (1 - v / ceil) * (H - PAD.t - PAD.b)
  const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ")
  const area = data.length > 0 ? `${path} L${x(data.length - 1).toFixed(1)},${H - PAD.b} L${x(0).toFixed(1)},${H - PAD.b} Z` : ""

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={name}>
        <Grid ticks={ticks} ceil={ceil} format={format} />
        <path d={area} className="fill-[#F97316]/15" />
        <path d={path} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-[#F97316]" />
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.value)} r={data.length > 40 ? 0 : 3} className="fill-[#F97316]">
            <title>{`${d.label}: ${format(d.value)}`}</title>
          </circle>
        ))}
        <XLabels labels={data.map((d) => d.label)} x={x} />
      </svg>
    </figure>
  )
}

// Literal class names (Tailwind can't see classes assembled at runtime).
const DONUT_STROKES = ["stroke-[#1E3A5F] dark:stroke-blue-400", "stroke-[#F97316]", "stroke-emerald-500", "stroke-violet-500", "stroke-sky-500", "stroke-amber-500", "stroke-pink-500", "stroke-slate-400"]
const SWATCH = ["bg-[#1E3A5F] dark:bg-blue-400", "bg-[#F97316]", "bg-emerald-500", "bg-violet-500", "bg-sky-500", "bg-amber-500", "bg-pink-500", "bg-slate-400"]

export function DonutChart({ slices, centerLabel }: { slices: { label: string; value: number }[]; centerLabel: string }) {
  const total = slices.reduce((n, s) => n + s.value, 0)
  const r = 52
  const c = 2 * Math.PI * r
  // Each slice starts where the previous one ended (computed up front: no mutation during render).
  const offsets = slices.map((_, i) => slices.slice(0, i).reduce((n, s) => n + (s.value / (total || 1)) * c, 0))

  if (total === 0) return <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No bookings in this period.</p>

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <svg viewBox="0 0 140 140" className="h-36 w-36 flex-shrink-0 -rotate-90" role="img" aria-label={centerLabel}>
        {slices.map((s, i) => {
          const len = (s.value / total) * c
          return (
            <circle key={s.label} cx={70} cy={70} r={r} fill="none" strokeWidth={22} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offsets[i]} className={DONUT_STROKES[i % DONUT_STROKES.length]}>
              <title>{`${s.label}: ${s.value}`}</title>
            </circle>
          )
        })}
        <g className="rotate-90 origin-center">
          <text x={70} y={68} textAnchor="middle" className="fill-slate-900 text-2xl font-bold dark:fill-white">{total}</text>
          <text x={70} y={84} textAnchor="middle" className="fill-slate-500 text-[9px] dark:fill-slate-400">{centerLabel}</text>
        </g>
      </svg>
      <ul className="w-full space-y-1.5 text-sm">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 flex-shrink-0 rounded-sm", SWATCH[i % SWATCH.length])} />
            <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{s.label}</span>
            <span className="font-semibold text-slate-900 dark:text-white">{s.value}</span>
            <span className="w-10 text-right text-xs text-slate-400">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function FunnelBars({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value))
  return (
    <ul className="space-y-3">
      {steps.map((s, i) => (
        <li key={s.label}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-slate-700 dark:text-slate-300">{s.label}</span>
            <span className="font-semibold text-slate-900 dark:text-white">{s.value}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
            <div className={cn("h-3 rounded-full", i === steps.length - 1 ? "bg-emerald-500" : i === 0 ? "bg-[#1E3A5F] dark:bg-blue-400" : "bg-[#F97316]")} style={{ width: `${(s.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
