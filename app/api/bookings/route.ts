import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { notifyGarage, notifyUser } from "@/lib/notifications"
import { z } from "zod"

const statusSchema = z.object({
  bookingId: z.string(),
  status: z.enum(["CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
})

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

    await notifyGarage({
      garageId: data.garageId,
      type: "BOOKING_CREATED",
      title: "New booking",
      body: `${booking.serviceType} booking for ${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model}`,
      link: `/garage-dashboard?booking=${booking.id}`,
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

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any

  try {
    const body = await req.json()
    const data = statusSchema.parse(body)

    const booking = await prisma.booking.findUnique({ where: { id: data.bookingId } })
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 })

    if (user.role === "GARAGE") {
      const garage = await prisma.garage.findUnique({ where: { userId: user.id } })
      if (!garage || garage.id !== booking.garageId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    } else if (user.role === "OWNER") {
      if (user.id !== booking.ownerId || data.status !== "CANCELLED") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const updated = await prisma.booking.update({
      where: { id: data.bookingId },
      data: {
        status: data.status,
        completedAt: data.status === "COMPLETED" ? new Date() : booking.completedAt,
      },
    })

    const statusLabel = data.status.replace("_", " ").toLowerCase()
    if (user.role === "GARAGE") {
      await notifyUser({
        userId: booking.ownerId,
        type: "BOOKING_STATUS_CHANGED",
        title: `Booking ${statusLabel}`,
        body: `Your ${booking.serviceType} booking is now ${statusLabel}`,
        link: `/dashboard?booking=${booking.id}`,
      })
    } else {
      await notifyGarage({
        garageId: booking.garageId,
        type: "BOOKING_STATUS_CHANGED",
        title: `Booking ${statusLabel}`,
        body: `A customer cancelled their ${booking.serviceType} booking`,
        link: `/garage-dashboard?booking=${booking.id}`,
      })
    }

    return NextResponse.json({ booking: updated })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: err.errors }, { status: 400 })
    }
    console.error("Bookings PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
