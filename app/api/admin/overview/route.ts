import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { getServiceLabel } from "@/lib/utils"

export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!session || (session.user as any).role !== "ADMIN" || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const admin = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, suspendedAt: true } })
  if (admin?.role !== "ADMIN" || admin.suspendedAt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const now = new Date()
  const trendStart = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)
  trendStart.setUTCHours(0, 0, 0, 0) // buckets below are keyed by UTC date

  const [completedBookings, serviceGroups, cityGarageGroups, garageBookingGroups, garageCities, attention, recentBookings, recentGarages, recentReviews, enquiryStatusCounts, recentEnquiries, sourceGroups] = await Promise.all([
    prisma.booking.findMany({
      where: { status: "COMPLETED", completedAt: { gte: trendStart } },
      select: { completedAt: true, totalPrice: true },
    }),
    // Aggregated in the database: this page must not load every booking and garage row.
    prisma.booking.groupBy({ by: ["serviceType"], _count: { _all: true } }),
    prisma.garage.groupBy({ by: ["city"], _count: { _all: true } }),
    prisma.booking.groupBy({ by: ["garageId"], _count: { _all: true }, _sum: { totalPrice: true } }),
    prisma.garage.findMany({ select: { id: true, city: true } }),
    Promise.all([
      prisma.garage.count({ where: { status: "PENDING" } }),
      prisma.garageDocument.count({ where: { status: "PENDING" } }),
      prisma.review.count({ where: { disputeStatus: "OPEN" } }),
      prisma.jobRequest.count({ where: { status: "OPEN" } }),
    ]),
    prisma.booking.findMany({
      select: { id: true, serviceType: true, createdAt: true, customerName: true, owner: { select: { name: true, email: true } }, garage: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.garage.findMany({
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.review.findMany({
      select: { id: true, rating: true, createdAt: true, garage: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.jobRequest.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.jobRequest.findMany({
      select: { id: true, guestName: true, serviceType: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.booking.groupBy({ by: ["source"], _count: { _all: true }, _sum: { totalPrice: true } }),
  ])

  // Revenue trend: last 30 days, bucketed by day
  const dayBuckets: Record<string, number> = {}
  for (let i = 0; i < 30; i++) {
    const d = new Date(trendStart.getTime() + i * 24 * 60 * 60 * 1000)
    dayBuckets[d.toISOString().slice(0, 10)] = 0
  }
  for (const b of completedBookings) {
    if (!b.completedAt) continue
    const key = b.completedAt.toISOString().slice(0, 10)
    if (key in dayBuckets) dayBuckets[key] += b.totalPrice
  }
  const revenueTrend = Object.entries(dayBuckets).map(([date, revenue]) => ({ date, revenue }))

  // Service type breakdown
  const serviceBreakdown = serviceGroups
    .map((g) => ({ serviceType: g.serviceType, label: getServiceLabel(g.serviceType), count: g._count._all }))
    .sort((a, b) => b.count - a.count)

  // Top cities by garage count + real booking count/revenue
  const cityOf = new Map(garageCities.map((g) => [g.id, g.city]))
  const cityBookings: Record<string, { count: number; revenue: number }> = {}
  for (const g of garageBookingGroups) {
    const city = cityOf.get(g.garageId)
    if (!city) continue
    const c = (cityBookings[city] ??= { count: 0, revenue: 0 })
    c.count += g._count._all
    c.revenue += g._sum.totalPrice ?? 0
  }

  const topCities = cityGarageGroups
    .map((g) => ({
      city: g.city,
      garages: g._count._all,
      bookings: cityBookings[g.city]?.count ?? 0,
      revenue: cityBookings[g.city]?.revenue ?? 0,
    }))
    .sort((a, b) => b.garages - a.garages)
    .slice(0, 5)

  // Combined activity feed
  const activity = [
    ...recentBookings.map((b) => ({
      type: "booking" as const,
      message: `${b.owner?.name ?? b.owner?.email ?? b.customerName ?? "A customer"} booked ${getServiceLabel(b.serviceType)} at ${b.garage.name}`,
      createdAt: b.createdAt,
    })),
    ...recentGarages.map((g) => ({
      type: "garage" as const,
      message: `${g.name} registered as a new garage`,
      createdAt: g.createdAt,
    })),
    ...recentReviews.map((r) => ({
      type: "review" as const,
      message: `${r.rating}★ review submitted for ${r.garage.name}`,
      createdAt: r.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8)

  // Enquiry (guest job request) funnel and volume
  const enquiryCounts = { OPEN: 0, QUOTED: 0, BOOKED: 0, CANCELLED: 0 } as Record<string, number>
  for (const row of enquiryStatusCounts) enquiryCounts[row.status] = row._count.status
  const totalEnquiries = Object.values(enquiryCounts).reduce((a, b) => a + b, 0)
  const conversionRate = totalEnquiries ? Math.round((enquiryCounts.BOOKED / totalEnquiries) * 1000) / 10 : 0

  const [pendingGarages, pendingDocuments, openDisputes, openEnquiries] = attention

  return NextResponse.json({
    attention: { pendingGarages, pendingDocuments, openDisputes, openEnquiries },
    revenueTrend,
    serviceBreakdown,
    bySource: sourceGroups.map((g) => ({ source: g.source, count: g._count._all, value: g._sum.totalPrice ?? 0 })).sort((a, b) => b.count - a.count),
    topCities,
    activity: [
      ...activity,
      ...recentEnquiries.map((e) => ({
        type: "enquiry" as const,
        message: `${e.guestName} posted a job request for ${getServiceLabel(e.serviceType)}`,
        createdAt: e.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8),
    enquiries: {
      total: totalEnquiries,
      counts: enquiryCounts,
      conversionRate,
    },
  })
}
