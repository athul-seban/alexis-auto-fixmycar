import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/session"

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, props: Params) {
  const params = await props.params
  const auth = await requireSession()
  if (!auth.ok) return auth.response
  const { user } = auth

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
