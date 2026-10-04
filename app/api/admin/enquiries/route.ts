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
    prisma.jobRequest.findMany({
      where,
      ...(q ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
      include: {
        responses: { select: { id: true, price: true, status: true, garage: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.jobRequest.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.jobRequest.count({ where }),
  ])

  const filtered = q
    ? allForStatus.filter((j) =>
        [j.guestName, j.guestEmail, j.city, j.postcode, j.registration].some((f) => f.toLowerCase().includes(q))
      )
    : allForStatus

  const total = q ? filtered.length : totalNoSearch
  const enquiries = (q ? filtered.slice((page - 1) * pageSize, page * pageSize) : filtered).map((j) => ({
    id: j.id,
    token: j.token,
    status: j.status,
    guestName: j.guestName,
    guestEmail: j.guestEmail,
    guestPhone: j.guestPhone,
    serviceType: j.serviceType,
    registration: j.registration,
    make: j.make,
    model: j.model,
    year: j.year,
    city: j.city,
    postcode: j.postcode,
    createdAt: j.createdAt,
    responseCount: j.responses.length,
    lowestPrice: j.responses.length ? Math.min(...j.responses.map((r) => r.price)) : null,
    acceptedGarage: j.responses.find((r) => r.status === "ACCEPTED")?.garage.name ?? null,
  }))

  const counts = { OPEN: 0, QUOTED: 0, BOOKED: 0, CANCELLED: 0 } as Record<string, number>
  for (const row of statusCounts) counts[row.status] = row._count.status

  return NextResponse.json({
    enquiries,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    counts,
  })
}
