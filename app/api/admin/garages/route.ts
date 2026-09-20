import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { z } from "zod"

const actionSchema = z.object({
  garageId: z.string(),
  action: z.enum(["approve", "reject", "suspend"]),
  reason: z.string().optional(),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") ?? "PENDING"
  const q = searchParams.get("q")?.trim().toLowerCase()
  const page = Math.max(1, Number(searchParams.get("page")) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize")) || 10))

  const [allForStatus, statusCounts] = await Promise.all([
    prisma.garage.findMany({
      where: { status: status as any },
      include: { user: { select: { name: true, email: true, phone: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.garage.groupBy({ by: ["status"], _count: { status: true } }),
  ])

  const filtered = q
    ? allForStatus.filter((g) =>
        [g.name, g.city, g.email].some((f) => f.toLowerCase().includes(q))
      )
    : allForStatus

  const total = filtered.length
  const start = (page - 1) * pageSize
  const garages = filtered.slice(start, start + pageSize)

  const counts = { PENDING: 0, APPROVED: 0, SUSPENDED: 0 } as Record<string, number>
  for (const row of statusCounts) counts[row.status] = row._count.status

  return NextResponse.json({
    garages,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    counts,
  })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { garageId, action } = actionSchema.parse(body)

    const statusMap = { approve: "APPROVED", reject: "SUSPENDED", suspend: "SUSPENDED" }

    const garage = await prisma.garage.update({
      where: { id: garageId },
      data: {
        status: statusMap[action] as any,
        isVerified: action === "approve",
      },
    })

    return NextResponse.json({ garage })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
