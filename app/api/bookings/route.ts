import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { z } from "zod"

const createSchema = z.object({
  vehicleId: z.string(),
  garageId: z.string(),
  quoteId: z.string().optional(),
  serviceType: z.string(),
  description: z.string().optional(),
  scheduledAt: z.string().datetime(),
  totalPrice: z.number().positive(),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any
  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")

  try {
    if (user.role === "OWNER") {
      const bookings = await prisma.booking.findMany({
        where: { ownerId: user.id, ...(status ? { status: status as any } : {}) },
        include: {
          vehicle: true,
          garage: { select: { id: true, name: true, slug: true, city: true, phone: true } },
          review: true,
        },
        orderBy: { scheduledAt: "desc" },
      })
      return NextResponse.json({ bookings })
    }

    if (user.role === "GARAGE") {
      const garage = await prisma.garage.findUnique({ where: { userId: user.id } })
      if (!garage) return NextResponse.json({ error: "Garage not found" }, { status: 404 })

      const bookings = await prisma.booking.findMany({
        where: { garageId: garage.id, ...(status ? { status: status as any } : {}) },
        include: {
          vehicle: true,
          owner: { select: { id: true, name: true, phone: true } },
          review: true,
        },
        orderBy: { scheduledAt: "desc" },
      })
      return NextResponse.json({ bookings })
    }

    if (user.role === "ADMIN") {
      const bookings = await prisma.booking.findMany({
        include: {
          vehicle: true,
          owner: { select: { id: true, name: true } },
          garage: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
      return NextResponse.json({ bookings })
    }

    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  } catch (err) {
    console.error("Bookings GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any
  if (user.role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    const booking = await prisma.booking.create({
      data: {
        ownerId: user.id,
        vehicleId: data.vehicleId,
        garageId: data.garageId,
        quoteId: data.quoteId,
        serviceType: data.serviceType as any,
        description: data.description,
        scheduledAt: new Date(data.scheduledAt),
        totalPrice: data.totalPrice,
        status: "PENDING",
      },
      include: {
        vehicle: true,
        garage: { select: { name: true, city: true } },
      },
    })

    if (data.quoteId) {
      await prisma.quote.update({
        where: { id: data.quoteId },
        data: { status: "ACCEPTED" },
      })
    }

    await prisma.garage.update({
      where: { id: data.garageId },
      data: { totalBookings: { increment: 1 } },
    })

    return NextResponse.json({ booking }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: err.errors }, { status: 400 })
    }
    console.error("Bookings POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
