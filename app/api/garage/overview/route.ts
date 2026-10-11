import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { parseCivilRange, rangeToUtc } from "@/lib/portal/date-range"
import { countNewEnquiries } from "@/lib/portal/enquiries"
import { computeKpis, computeToday, type KpiRow } from "@/lib/portal/kpi"
import { addDays, diffDays, londonDateString, londonDayRange, londonTimeString, todayLondon } from "@/lib/portal/tz"
import { effectivePlan, monthStart, plansEnforced } from "@/lib/portal/plans"
import { garageReadiness } from "@/lib/portal/readiness"
import { garageUnreadCount } from "@/lib/messaging"

const KPI_SELECT = {
  source: true,
  status: true,
  scheduledAt: true,
  createdAt: true,
  durationMins: true,
  totalPrice: true,
  finalInvoiceValue: true,
} as const

/** Bookings created per bucket across the range: daily up to ~a month, otherwise N-day buckets (at most 31 points). */
function creationTrend(rows: { createdAt: Date }[], range: { from: string; to: string }) {
  const days = Math.max(1, diffDays(range.from, range.to) + 1)
  const size = Math.ceil(days / 31)
  const buckets = Array.from({ length: Math.ceil(days / size) }, (_, i) => ({ date: addDays(range.from, i * size), count: 0 }))
  for (const r of rows) {
    const i = Math.floor(diffDays(range.from, londonDateString(r.createdAt)) / size)
    if (i >= 0 && i < buckets.length) buckets[i].count += 1
  }
  return { bucketDays: size, points: buckets }
}

export const GET = withGarage("Garage overview GET", async (req, { garage }) => {
  const sp = new URL(req.url).searchParams
  const now = new Date()
  const parsed = parseCivilRange(sp.get("from"), sp.get("to"), now)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const range = rangeToUtc(parsed.range)

  const today = todayLondon(now)
  const todayRange = londonDayRange(today, today)

  // The period of equal length immediately before the range, for "vs previous" deltas.
  const span = range.lt.getTime() - range.gte.getTime()
  const prevRange = { gte: new Date(range.gte.getTime() - span), lt: range.gte }

  const [rangeRows, prevRows, todayRows, enquiries, todayList, unrepliedReviews, unreadMessages, priceCount, weekAhead, leadsUsed] = await Promise.all([
    // Anything created or scheduled inside the range; KPIs apply their own per-metric date rule.
    prisma.booking.findMany({
      where: {
        garageId: garage.id,
        OR: [{ createdAt: { gte: range.gte, lt: range.lt } }, { scheduledAt: { gte: range.gte, lt: range.lt } }],
      },
      select: KPI_SELECT,
    }),
    prisma.booking.findMany({
      where: {
        garageId: garage.id,
        OR: [{ createdAt: { gte: prevRange.gte, lt: prevRange.lt } }, { scheduledAt: { gte: prevRange.gte, lt: prevRange.lt } }],
      },
      select: KPI_SELECT,
    }),
    // Today's activity plus any slot that has passed without an outcome (however old).
    prisma.booking.findMany({
      where: {
        garageId: garage.id,
        OR: [
          { createdAt: { gte: todayRange.gte, lt: todayRange.lt } },
          { scheduledAt: { gte: todayRange.gte, lt: todayRange.lt } },
          { status: { in: ["PENDING", "CONFIRMED"] }, scheduledAt: { lt: now } },
        ],
      },
      select: KPI_SELECT,
    }),
    countNewEnquiries(garage),
    prisma.booking.findMany({
      where: { garageId: garage.id, scheduledAt: { gte: todayRange.gte, lt: todayRange.lt }, status: { notIn: ["CANCELLED"] } },
      orderBy: { scheduledAt: "asc" },
      take: 8,
      select: { id: true, scheduledAt: true, timeConfirmed: true, status: true, serviceType: true, customerName: true, vrm: true, vehicleMake: true },
    }),
    prisma.review.count({ where: { garageId: garage.id, reply: null } }),
    garageUnreadCount(garage),
    prisma.servicePrice.count({ where: { garageId: garage.id, isActive: true } }),
    prisma.booking.count({
      where: { garageId: garage.id, status: { in: ["PENDING", "CONFIRMED"] }, scheduledAt: { gte: now, lt: new Date(now.getTime() + 7 * 24 * 3_600_000) } },
    }),
    prisma.jobResponse.count({ where: { garageId: garage.id, createdAt: { gte: monthStart(now) } } }),
  ])
  const plan = effectivePlan(garage)

  const kpis = computeKpis(rangeRows as KpiRow[], range)
  const prev = computeKpis(prevRows as KpiRow[], prevRange)
  const readiness = garageReadiness({ ...garage, priceCount })
  return NextResponse.json({
    garage: { name: garage.name, logo: garage.logo, slug: garage.slug, status: garage.status },
    range: parsed.range,
    today: computeToday(todayRows as KpiRow[], now),
    marketplace: kpis.marketplace,
    widget: kpis.widget,
    direct: kpis.direct,
    noShowRate: kpis.noShowRate,
    previous: { marketplace: prev.marketplace, widget: prev.widget, noShowRate: prev.noShowRate },
    pendingEnquiries: enquiries,
    weekAhead,
    rating: { average: garage.averageRating, reviews: garage.totalReviews },
    avgResponseMins: garage.avgResponseMins,
    plan: { label: plan.label, enforced: plansEnforced(), leadsPerMonth: plan.leadsPerMonth, leadsUsed, credits: garage.leadCredits },
    trend: creationTrend(rangeRows, parsed.range),
    unrepliedReviews,
    unreadMessages,
    todayBookings: todayList.map((b) => ({
      id: b.id,
      time: b.timeConfirmed ? londonTimeString(b.scheduledAt) : null,
      status: b.status,
      serviceType: b.serviceType,
      customer: b.customerName,
      vehicle: [b.vehicleMake, b.vrm].filter(Boolean).join(" · ") || null,
    })),
    readiness: { ready: readiness.ready, missing: readiness.checks.filter((c) => !c.ok).map((c) => ({ label: c.label, required: c.required })) },
  })
})
