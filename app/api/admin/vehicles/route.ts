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
  const q = searchParams.get("q")?.trim().toLowerCase()
  const dueSoon = searchParams.get("dueSoon") === "true"
  const page = Math.max(1, Number(searchParams.get("page")) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize")) || 10))

  const now = new Date()
  const dueSoonWindow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const where = dueSoon
    ? {
        OR: [
          { motDueDate: { gte: now, lte: dueSoonWindow } },
          { serviceDueDate: { gte: now, lte: dueSoonWindow } },
        ],
      }
    : undefined

  const allVehicles = await prisma.vehicle.findMany({
    where,
    include: {
      owner: { select: { name: true, email: true } },
      _count: { select: { bookings: true, quotes: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const filtered = q
    ? allVehicles.filter((v) =>
        [v.registration, v.make, v.model, v.owner.name ?? "", v.owner.email].some((f) => f.toLowerCase().includes(q))
      )
    : allVehicles

  const total = filtered.length
  const start = (page - 1) * pageSize
  const vehicles = filtered.slice(start, start + pageSize).map((v) => ({
    id: v.id,
    registration: v.registration,
    make: v.make,
    model: v.model,
    year: v.year,
    fuel: v.fuel,
    mileage: v.mileage,
    motDueDate: v.motDueDate,
    serviceDueDate: v.serviceDueDate,
    owner: v.owner,
    bookingCount: v._count.bookings,
    quoteCount: v._count.quotes,
  }))

  return NextResponse.json({
    vehicles,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}
