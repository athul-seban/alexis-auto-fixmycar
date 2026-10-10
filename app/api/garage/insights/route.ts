import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { hasFeature } from "@/lib/portal/plans"
import { diffDays } from "@/lib/portal/tz"
import { parseCivilRange, presetRange, rangeToUtc } from "@/lib/portal/date-range"
import { buildFunnel, buildSeries, byChannel, bySource, byService, defaultGranularity, type Granularity } from "@/lib/portal/insights"
import type { KpiRow } from "@/lib/portal/kpi"

const GRANULARITIES: Granularity[] = ["day", "week", "month"]

export const GET = withGarage("Garage insights GET", async (req, { garage }) => {
  if (!hasFeature(garage, "insights")) {
    return NextResponse.json({ error: "Insights are part of the Pro and Premium plans.", code: "PLAN_REQUIRED" }, { status: 402 })
  }
  const sp = new URL(req.url).searchParams
  const now = new Date()
  // Insights default to a longer window than the dashboard: the last 3 months.
  const hasRange = sp.get("from") || sp.get("to")
  const parsed = hasRange ? parseCivilRange(sp.get("from"), sp.get("to"), now) : ({ ok: true, range: presetRange("3m", now) } as const)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const range = parsed.range

  const g = sp.get("granularity") as Granularity | null
  if (g && !GRANULARITIES.includes(g)) return NextResponse.json({ error: "granularity must be day, week or month" }, { status: 400 })
  const granularity = g ?? defaultGranularity(range)
  // Day buckets over a long range would be unreadable and huge.
  if (granularity === "day" && diffDays(range.from, range.to) > 120) {
    return NextResponse.json({ error: "Daily detail is limited to 120 days — choose weekly or monthly" }, { status: 400 })
  }

  const utc = rangeToUtc(range)
  // A day either side so London-date bucketing at the edges never misses a row.
  const pad = { gte: new Date(utc.gte.getTime() - 86400000), lt: new Date(utc.lt.getTime() + 86400000) }

  const [rows, quotes, responses] = await Promise.all([
    prisma.booking.findMany({
      where: { garageId: garage.id, OR: [{ createdAt: pad }, { scheduledAt: pad }] },
      select: { source: true, status: true, serviceType: true, scheduledAt: true, createdAt: true, totalPrice: true, finalInvoiceValue: true },
    }),
    prisma.quote.findMany({ where: { garageId: garage.id, createdAt: { gte: utc.gte, lt: utc.lt } }, select: { status: true } }),
    prisma.jobResponse.findMany({ where: { garageId: garage.id, createdAt: { gte: utc.gte, lt: utc.lt } }, select: { status: true } }),
  ])
  const kpiRows = rows as (KpiRow & { serviceType: string })[]

  const series = buildSeries(kpiRows, range, granularity)
  return NextResponse.json({
    range,
    granularity,
    series,
    totals: {
      created: series.reduce((n, p) => n + p.created, 0),
      attended: series.reduce((n, p) => n + p.attended, 0),
      noShow: series.reduce((n, p) => n + p.noShow, 0),
      revenue: Math.round(series.reduce((n, p) => n + p.revenue, 0) * 100) / 100,
    },
    bySource: bySource(kpiRows, range),
    byChannel: byChannel(kpiRows, range),
    byService: byService(kpiRows, range).slice(0, 8),
    funnel: buildFunnel({ quoteStatuses: quotes.map((q) => q.status), responseStatuses: responses.map((r) => r.status) }),
  })
})
