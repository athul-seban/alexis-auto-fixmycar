import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { normaliseSearchQuery } from "@/lib/portal/search-text"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const page = Math.max(1, Number(searchParams.get("page")) || 1)
  const legacyLimit = Number(searchParams.get("limit"))
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize")) || legacyLimit || 10))

  const createdAt: { gte?: Date; lte?: Date } = {}
  if (from) createdAt.gte = new Date(from)
  if (to) createdAt.lte = new Date(`${to}T23:59:59.999Z`)

  const source = searchParams.get("source")
  const q = searchParams.get("q")?.trim()

  const where = {
    ...(status ? { status } : {}),
    ...(source ? { source } : {}),
    ...(q ? { searchText: { contains: normaliseSearchQuery(q) } } : {}),
    ...(from || to ? { createdAt } : {}),
  }

  const [bookings, total, statusCounts] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        owner: { select: { name: true, email: true } },
        garage: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.booking.count({ where }),
    prisma.booking.groupBy({ by: ["status"], _count: { status: true } }),
  ])

  const counts: Record<string, number> = {}
  for (const row of statusCounts) counts[row.status] = row._count.status

  return NextResponse.json({
    bookings: bookings.map((b) => ({
      id: b.id,
      serviceType: b.serviceType,
      status: b.status,
      totalPrice: b.totalPrice,
      scheduledAt: b.scheduledAt,
      garage: b.garage.name,
      // Walk-in / widget bookings have no owner account; fall back to the captured customer name.
      customer: b.owner?.name ?? b.owner?.email ?? b.customerName ?? "Walk-in customer",
      source: b.source,
      reference: b.reference,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    counts,
  })
}
