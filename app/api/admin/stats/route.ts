import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const prevPeriodStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

  const [
    totalUsers,
    usersThisPeriod,
    usersPrevPeriod,
    totalGarages,
    garagesThisPeriod,
    garagesPrevPeriod,
    totalBookings,
    bookingsThisPeriod,
    bookingsPrevPeriod,
    pendingApprovals,
    revenueThisPeriod,
    revenuePrevPeriod,
    revenueTotal,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: periodStart } } }),
    prisma.user.count({ where: { createdAt: { gte: prevPeriodStart, lt: periodStart } } }),
    prisma.garage.count(),
    prisma.garage.count({ where: { createdAt: { gte: periodStart } } }),
    prisma.garage.count({ where: { createdAt: { gte: prevPeriodStart, lt: periodStart } } }),
    prisma.booking.count(),
    prisma.booking.count({ where: { createdAt: { gte: periodStart } } }),
    prisma.booking.count({ where: { createdAt: { gte: prevPeriodStart, lt: periodStart } } }),
    prisma.garage.count({ where: { status: "PENDING" } }),
    prisma.booking.aggregate({
      _sum: { totalPrice: true },
      where: { status: "COMPLETED", completedAt: { gte: periodStart } },
    }),
    prisma.booking.aggregate({
      _sum: { totalPrice: true },
      where: { status: "COMPLETED", completedAt: { gte: prevPeriodStart, lt: periodStart } },
    }),
    prisma.booking.aggregate({
      _sum: { totalPrice: true },
      where: { status: "COMPLETED" },
    }),
  ])

  return NextResponse.json({
    totalUsers,
    userGrowth: pctChange(usersThisPeriod, usersPrevPeriod),
    totalGarages,
    garageGrowth: pctChange(garagesThisPeriod, garagesPrevPeriod),
    totalBookings,
    bookingGrowth: pctChange(bookingsThisPeriod, bookingsPrevPeriod),
    revenue: revenueTotal._sum.totalPrice ?? 0,
    revenueGrowth: pctChange(
      revenueThisPeriod._sum.totalPrice ?? 0,
      revenuePrevPeriod._sum.totalPrice ?? 0
    ),
    pendingApprovals,
  })
}
