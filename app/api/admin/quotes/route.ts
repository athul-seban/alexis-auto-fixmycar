import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")
  const q = searchParams.get("q")?.trim().toLowerCase()
  const page = Math.max(1, Number(searchParams.get("page")) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize")) || 10))

  const where = status ? { status } : undefined
  const [allForStatus, statusCounts, totalNoSearch] = await Promise.all([
    prisma.quote.findMany({
      where,
      ...(q ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
      include: {
        owner: { select: { name: true, email: true } },
        garage: { select: { name: true } },
        vehicle: { select: { registration: true, make: true, model: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.quote.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.quote.count({ where }),
  ])

  const filtered = q
    ? allForStatus.filter((quote) =>
        [quote.owner.name ?? "", quote.owner.email, quote.garage.name, quote.vehicle.registration].some((f) =>
          f.toLowerCase().includes(q)
        )
      )
    : allForStatus

  const total = q ? filtered.length : totalNoSearch
  const quotes = (q ? filtered.slice((page - 1) * pageSize, page * pageSize) : filtered).map((quote) => ({
    id: quote.id,
    serviceType: quote.serviceType,
    description: quote.description,
    status: quote.status,
    price: quote.price,
    createdAt: quote.createdAt,
    customer: quote.owner.name ?? quote.owner.email,
    garage: quote.garage.name,
    vehicle: `${quote.vehicle.registration} · ${quote.vehicle.make} ${quote.vehicle.model}`,
  }))

  const counts = { PENDING: 0, SENT: 0, ACCEPTED: 0, REJECTED: 0, EXPIRED: 0 } as Record<string, number>
  for (const row of statusCounts) counts[row.status] = row._count.status

  return NextResponse.json({
    quotes,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    counts,
  })
}
