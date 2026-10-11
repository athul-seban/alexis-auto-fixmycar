import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { ownerUnreadCount } from "@/lib/messaging"

/**
 * Customer overview extras that the list endpoints can't give cheaply: the unread-message count (computed without
 * marking anything read, unlike GET /api/messages), what the customer has spent this year, and account totals used
 * to decide whether to show the getting-started checklist.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; role?: string } | undefined
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (user.role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1))
  const [unreadMessages, spent, vehicles, quotes, bookings] = await Promise.all([
    ownerUnreadCount(user.id),
    prisma.booking.aggregate({
      where: { ownerId: user.id, status: "COMPLETED", completedAt: { gte: yearStart } },
      _count: { _all: true },
    }),
    prisma.vehicle.count({ where: { ownerId: user.id } }),
    prisma.quote.count({ where: { ownerId: user.id } }),
    prisma.booking.count({ where: { ownerId: user.id } }),
  ])

  // Money actually invoiced where the garage recorded it, else the booked price (same rule as the garage KPIs).
  const completedRows = await prisma.booking.findMany({
    where: { ownerId: user.id, status: "COMPLETED", completedAt: { gte: yearStart } },
    select: { finalInvoiceValue: true, totalPrice: true },
  })
  const spentThisYear = Math.round(completedRows.reduce((n, b) => n + (b.finalInvoiceValue ?? b.totalPrice), 0) * 100) / 100

  return NextResponse.json({
    unreadMessages,
    spentThisYear,
    completedThisYear: spent._count._all,
    totals: { vehicles, quotes, bookings },
  })
}
