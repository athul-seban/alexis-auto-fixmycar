import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any
  if (user.role !== "GARAGE") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const garage = await prisma.garage.findUnique({ where: { userId: user.id } })
    if (!garage) return NextResponse.json({ error: "Garage not found" }, { status: 404 })

    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
    sixMonthsAgo.setDate(1)
    sixMonthsAgo.setHours(0, 0, 0, 0)

    const [bookings, quotes, jobResponses] = await Promise.all([
      prisma.booking.findMany({
        where: { garageId: garage.id, createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true, totalPrice: true, serviceType: true, status: true },
      }),
      prisma.quote.findMany({
        where: { garageId: garage.id, createdAt: { gte: sixMonthsAgo } },
        select: { status: true },
      }),
      prisma.jobResponse.findMany({
        where: { garageId: garage.id },
        select: { status: true },
      }),
    ])

    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const monthlyMap = new Map<string, { bookings: number; revenue: number }>()
    for (let i = 0; i < 6; i++) {
      const d = new Date(sixMonthsAgo)
      d.setMonth(d.getMonth() + i)
      monthlyMap.set(monthKey(d), { bookings: 0, revenue: 0 })
    }
    for (const b of bookings) {
      const key = monthKey(new Date(b.createdAt))
      const entry = monthlyMap.get(key)
      if (entry) {
        entry.bookings += 1
        if (b.status === "COMPLETED") entry.revenue += b.totalPrice
      }
    }

    const serviceBreakdown = new Map<string, number>()
    for (const b of bookings) {
      serviceBreakdown.set(b.serviceType, (serviceBreakdown.get(b.serviceType) ?? 0) + 1)
    }

    const totalQuotes = quotes.length
    const respondedQuotes = quotes.filter((q) => q.status !== "PENDING").length
    const totalJobs = jobResponses.length
    const acceptedJobs = jobResponses.filter((j) => j.status === "ACCEPTED").length

    return NextResponse.json({
      monthly: Array.from(monthlyMap.entries()).map(([month, v]) => ({ month, ...v })),
      serviceBreakdown: Array.from(serviceBreakdown.entries()).map(([serviceType, count]) => ({ serviceType, count })),
      quoteResponseRate: totalQuotes ? Math.round((respondedQuotes / totalQuotes) * 100) : null,
      jobAcceptRate: totalJobs ? Math.round((acceptedJobs / totalJobs) * 100) : null,
      totals: {
        totalBookings: garage.totalBookings,
        totalReviews: garage.totalReviews,
        averageRating: garage.averageRating,
      },
    })
  } catch (err) {
    console.error("Garage analytics GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
