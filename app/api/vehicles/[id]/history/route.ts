import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, props: Params) {
  const params = await props.params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any

  try {
    const vehicle = await prisma.vehicle.findFirst({ where: { id: params.id, ownerId: user.id } })
    if (!vehicle) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 })

    const bookings = await prisma.booking.findMany({
      where: { vehicleId: params.id, status: "COMPLETED" },
      include: {
        garage: { select: { id: true, name: true, slug: true, city: true } },
        review: true,
      },
      orderBy: { completedAt: "desc" },
    })

    return NextResponse.json({ history: bookings })
  } catch (err) {
    console.error("Vehicle history GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
