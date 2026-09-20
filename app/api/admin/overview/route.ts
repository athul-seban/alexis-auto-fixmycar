import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { getServiceLabel } from "@/lib/utils"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const trendStart = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)
  trendStart.setHours(0, 0, 0, 0)

  const [completedBookings, allBookings, garages, recentBookings, recentGarages, recentReviews] = await Promise.all([
    prisma.booking.findMany({
      where: { status: "COMPLETED", completedAt: { gte: trendStart } },
      select: { completedAt: true, totalPrice: true },
    }),
    prisma.booking.findMany({
      select: { serviceType: true, totalPrice: true, garage: { select: { city: true } } },
    }),
    prisma.garage.findMany({ select: { city: true } }),
    prisma.booking.findMany({
      select: { id: true, serviceType: true, createdAt: true, owner: { select: { name: true, email: true } }, garage: { select: { name: true } } },
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
  const serviceCounts: Record<string, number> = {}
  for (const b of allBookings) {
    serviceCounts[b.serviceType] = (serviceCounts[b.serviceType] ?? 0) + 1
  }
  const serviceBreakdown = Object.entries(serviceCounts)
    .map(([serviceType, count]) => ({ serviceType, label: getServiceLabel(serviceType), count }))
    .sort((a, b) => b.count - a.count)

  // Top cities by garage count + real booking count/revenue
  const cityGarageCounts: Record<string, number> = {}
  for (const g of garages) cityGarageCounts[g.city] = (cityGarageCounts[g.city] ?? 0) + 1

  const cityBookings: Record<string, { count: number; revenue: number }> = {}
  for (const b of allBookings) {
    const city = b.garage.city
    if (!cityBookings[city]) cityBookings[city] = { count: 0, revenue: 0 }
    cityBookings[city].count += 1
    cityBookings[city].revenue += b.totalPrice
  }

  const topCities = Object.entries(cityGarageCounts)
    .map(([city, garageCount]) => ({
      city,
      garages: garageCount,
      bookings: cityBookings[city]?.count ?? 0,
      revenue: cityBookings[city]?.revenue ?? 0,
    }))
    .sort((a, b) => b.garages - a.garages)
    .slice(0, 5)

  // Combined activity feed
  const activity = [
    ...recentBookings.map((b) => ({
      type: "booking" as const,
      message: `${b.owner.name ?? b.owner.email} booked ${getServiceLabel(b.serviceType)} at ${b.garage.name}`,
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

  return NextResponse.json({ revenueTrend, serviceBreakdown, topCities, activity })
}
