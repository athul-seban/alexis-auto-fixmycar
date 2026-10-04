import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { parseCivilRange, rangeToUtc } from "@/lib/portal/date-range"
import { countNewEnquiries } from "@/lib/portal/enquiries"
import { computeKpis, computeToday, type KpiRow } from "@/lib/portal/kpi"
import { londonDayRange, todayLondon } from "@/lib/portal/tz"

const KPI_SELECT = {
  source: true,
  status: true,
  scheduledAt: true,
  createdAt: true,
  durationMins: true,
  totalPrice: true,
  finalInvoiceValue: true,
} as const

export const GET = withGarage("Garage overview GET", async (req, { garage }) => {
  const sp = new URL(req.url).searchParams
  const now = new Date()
  const parsed = parseCivilRange(sp.get("from"), sp.get("to"), now)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const range = rangeToUtc(parsed.range)

  const today = todayLondon(now)
  const todayRange = londonDayRange(today, today)

  const [rangeRows, todayRows, enquiries] = await Promise.all([
    // Anything created or scheduled inside the range; KPIs apply their own per-metric date rule.
    prisma.booking.findMany({
      where: {
        garageId: garage.id,
        OR: [{ createdAt: { gte: range.gte, lt: range.lt } }, { scheduledAt: { gte: range.gte, lt: range.lt } }],
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
  ])

  const kpis = computeKpis(rangeRows as KpiRow[], range)
  return NextResponse.json({
    garage: { name: garage.name, logo: garage.logo, slug: garage.slug, status: garage.status },
    range: parsed.range,
    today: computeToday(todayRows as KpiRow[], now),
    marketplace: kpis.marketplace,
    widget: kpis.widget,
    direct: kpis.direct,
    noShowRate: kpis.noShowRate,
    pendingEnquiries: enquiries,
  })
})
