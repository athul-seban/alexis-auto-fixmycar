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
  const role = searchParams.get("role")
  const q = searchParams.get("q")?.trim().toLowerCase()

  const users = await prisma.user.findMany({
    where: role ? { role } : undefined,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      _count: { select: { bookings: true } },
      garage: { select: { totalBookings: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const filtered = q
    ? users.filter(
        (u) => u.name?.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      )
    : users

  return NextResponse.json({
    users: filtered.slice(0, 100).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      joinedAt: u.createdAt,
      bookings: u.role === "GARAGE" ? u.garage?.totalBookings ?? 0 : u._count.bookings,
    })),
  })
}
