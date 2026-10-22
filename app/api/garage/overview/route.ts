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
import { getBilling, locationIdsOf } from "@/lib/org/billing"
import { jobScope, scopeWhere } from "@/lib/org/own-jobs"

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

export const GET = withGarage("Garage overview GET", async (req, ctx) => {
  const { garage, can } = ctx
  const sp = new URL(req.url).searchParams
  const now = new Date()
  const parsed = parseCivilRange(sp.get("from"), sp.get("to"), now)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const range = rangeToUtc(parsed.range)

  // The dashboard is every member's landing page, so each part of it appears only for the roles that may see it: a
  // technician sees their own jobs, not the location's takings, enquiries, reviews, messages or billing.
  const scope = await jobScope(ctx, "bookings")
  const mine = scopeWhere(scope)
  const sees = {
    bookings: scope !== null,
    enquiries: can("enquiries.view"),
    reviews: can("reviews.view"),
    messages: can("messages.view"),
    billing: can("billing.view"),
    profile: can("profile.edit"),
    insights: can("insights.view"),
  }
  // Takings are for roles that may see insights: everyone else gets the counts but zero money.
  const redact = <T extends { fiv: number }>(k: T): T => (sees.insights ? k : { ...k, fiv: 0 })
  const [billing, locationIds] = await Promise.all([getBilling(garage.id), sees.billing ? locationIdsOf(garage.id) : Promise.resolve([garage.id])])

  const today = todayLondon(now)
  const todayRange = londonDayRange(today, today)

  // The period of equal length immediately before the range, for "vs previous" deltas.
  const span = range.lt.getTime() - range.gte.getTime()
  const prevRange = { gte: new Date(range.gte.getTime() - span), lt: range.gte }

  const [rangeRows, prevRows, todayRows, enquiries, todayList, unrepliedReviews, unreadMessages, priceCount, weekAhead, leadsUsed] = await Promise.all([
    // Anything created or scheduled inside the range; KPIs apply their own per-metric date rule.
    prisma.booking.findMany({
      where: {
        AND: [
          { garageId: garage.id, OR: [{ createdAt: { gte: range.gte, lt: range.lt } }, { scheduledAt: { gte: range.gte, lt: range.lt } }] },
          mine,
        ],
      },
      select: KPI_SELECT,
    }),
    prisma.booking.findMany({
      where: {
        AND: [
          { garageId: garage.id, OR: [{ createdAt: { gte: prevRange.gte, lt: prevRange.lt } }, { scheduledAt: { gte: prevRange.gte, lt: prevRange.lt } }] },
          mine,
        ],
      },
      select: KPI_SELECT,
    }),
    // Today's activity plus any slot that has passed without an outcome (however old).
    prisma.booking.findMany({
      where: {
        AND: [
          {
            garageId: garage.id,
            OR: [
              { createdAt: { gte: todayRange.gte, lt: todayRange.lt } },
              { scheduledAt: { gte: todayRange.gte, lt: todayRange.lt } },
              { status: { in: ["PENDING", "CONFIRMED"] }, scheduledAt: { lt: now } },
            ],
          },
          mine,
        ],
      },
      select: KPI_SELECT,
    }),
    sees.enquiries ? countNewEnquiries(garage) : 0,
    prisma.booking.findMany({
      where: { AND: [{ garageId: garage.id, scheduledAt: { gte: todayRange.gte, lt: todayRange.lt }, status: { notIn: ["CANCELLED"] } }, mine] },
      orderBy: { scheduledAt: "asc" },
      take: 8,
      select: { id: true, scheduledAt: true, timeConfirmed: true, status: true, serviceType: true, customerName: true, vrm: true, vehicleMake: true },
    }),
    sees.reviews ? prisma.review.count({ where: { garageId: garage.id, reply: null } }) : 0,
    sees.messages ? garageUnreadCount(garage) : 0,
    sees.profile ? prisma.servicePrice.count({ where: { garageId: garage.id, isActive: true } }) : 0,
    prisma.booking.count({
      where: { AND: [{ garageId: garage.id, status: { in: ["PENDING", "CONFIRMED"] }, scheduledAt: { gte: now, lt: new Date(now.getTime() + 7 * 24 * 3_600_000) } }, mine] },
    }),
    // Leads count against the business's one monthly allowance, whichever location answered.
    sees.billing ? prisma.jobResponse.count({ where: { garageId: { in: locationIds }, createdAt: { gte: monthStart(now) } } }) : 0,
  ])
  const plan = effectivePlan(billing)

  const kpis = computeKpis(rangeRows as KpiRow[], range)
  const prev = computeKpis(prevRows as KpiRow[], prevRange)
  const readiness = garageReadiness({ ...garage, priceCount })
  return NextResponse.json({
    garage: { name: garage.name, logo: garage.logo, slug: garage.slug, status: garage.status },
    range: parsed.range,
    today: computeToday(todayRows as KpiRow[], now),
    marketplace: redact(kpis.marketplace),
    widget: redact(kpis.widget),
    direct: redact(kpis.direct),
    noShowRate: kpis.noShowRate,
    previous: { marketplace: redact(prev.marketplace), widget: redact(prev.widget), noShowRate: prev.noShowRate },
    pendingEnquiries: enquiries,
    weekAhead,
    rating: { average: garage.averageRating, reviews: garage.totalReviews },
    avgResponseMins: garage.avgResponseMins,
    plan: sees.billing
      ? { label: plan.label, enforced: plansEnforced(), leadsPerMonth: plan.leadsPerMonth, leadsUsed, credits: billing.leadCredits }
      : { label: plan.label, enforced: false, leadsPerMonth: null, leadsUsed: 0, credits: 0 },
    /** Which parts of the dashboard this role may see; the page hides the rest. */
    sees,
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
    readiness: sees.profile
      ? { ready: readiness.ready, missing: readiness.checks.filter((c) => !c.ok).map((c) => ({ label: c.label, required: c.required })) }
      : { ready: true, missing: [] },
  })
}, { permission: "member" })
