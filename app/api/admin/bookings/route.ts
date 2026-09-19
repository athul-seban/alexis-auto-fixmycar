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
  const limit = Math.min(Number(searchParams.get("limit")) || 20, 100)

  const bookings = await prisma.booking.findMany({
    where: status ? { status } : undefined,
    include: {
      owner: { select: { name: true, email: true } },
      garage: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  return NextResponse.json({
    bookings: bookings.map((b) => ({
      id: b.id,
      serviceType: b.serviceType,
      status: b.status,
      totalPrice: b.totalPrice,
      scheduledAt: b.scheduledAt,
      garage: b.garage.name,
      customer: b.owner.name ?? b.owner.email,
    })),
  })
}
