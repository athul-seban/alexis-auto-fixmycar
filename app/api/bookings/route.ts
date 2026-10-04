import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { PLACEHOLDER_LEAD_MS, createBooking, transitionBooking, type Actor } from "@/lib/portal/booking-service"
import { handleRouteError } from "@/lib/portal/route-errors"
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
  // Optional: when omitted the time is a placeholder the garage later agrees with the customer.
  scheduledAt: z.string().datetime().optional(),
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

    const explicitTime = data.scheduledAt ? new Date(data.scheduledAt) : null
    // The service verifies the vehicle/quote belong to this customer and the garage is approved.
    const booking = await createBooking({
      garageId: data.garageId,
      source: data.quoteId ? "QUOTE" : "MARKETPLACE",
      ownerId: user.id,
      vehicleId: data.vehicleId,
      quoteId: data.quoteId,
      serviceType: data.serviceType,
      description: data.description,
      scheduledAt: explicitTime ?? new Date(Date.now() + PLACEHOLDER_LEAD_MS),
      timeConfirmed: explicitTime !== null,
      totalPrice: data.totalPrice,
    })

    return NextResponse.json({ booking }, { status: 201 })
  } catch (err) {
    return handleRouteError(err, "Bookings POST")
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

    let actor: Actor
    if (user.role === "GARAGE") {
      const garage = await prisma.garage.findUnique({ where: { userId: user.id } })
      if (!garage || garage.id !== booking.garageId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      // Suspended garages are read-only (same rule as the portal's { write: true } routes).
      if (garage.status === "SUSPENDED") {
        return NextResponse.json({ error: "Your garage is suspended — the portal is read-only", code: "GARAGE_SUSPENDED" }, { status: 403 })
      }
      actor = { role: "GARAGE", garageId: garage.id }
    } else if (user.role === "OWNER") {
      if (user.id !== booking.ownerId || data.status !== "CANCELLED") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      actor = { role: "OWNER", userId: user.id }
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Applies the transition rules (e.g. terminal statuses can't be changed) and notifies the other party.
    const updated = await transitionBooking({ bookingId: booking.id, to: data.status, actor })
    return NextResponse.json({ booking: updated })
  } catch (err) {
    return handleRouteError(err, "Bookings PATCH")
  }
}
