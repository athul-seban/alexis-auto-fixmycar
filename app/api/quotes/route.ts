import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { notifyGarage, notifyUser } from "@/lib/notifications"
import { garageLinks } from "@/lib/portal/links"
import { z } from "zod"

const createSchema = z.object({
  vehicleId: z.string(),
  garageId: z.string(),
  serviceType: z.string(),
  description: z.string().min(10),
})

const respondSchema = z.object({
  quoteId: z.string(),
  price: z.number().positive(),
  laborCost: z.number().positive().optional(),
  partsCost: z.number().positive().optional(),
  notes: z.string().optional(),
  validDays: z.number().min(1).max(30).default(7),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any
  const { searchParams } = new URL(req.url)
  const role = user.role

  try {
    if (role === "OWNER") {
      const quotes = await prisma.quote.findMany({
        where: { ownerId: user.id },
        include: {
          vehicle: true,
          garage: { select: { id: true, name: true, slug: true, city: true, averageRating: true, isVerified: true } },
        },
        orderBy: { createdAt: "desc" },
      })
      return NextResponse.json({ quotes })
    }

    if (role === "GARAGE") {
      const garage = await prisma.garage.findUnique({ where: { userId: user.id } })
      if (!garage) return NextResponse.json({ error: "Garage not found" }, { status: 404 })

      const quotes = await prisma.quote.findMany({
        where: { garageId: garage.id },
        include: {
          vehicle: true,
          owner: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { createdAt: "desc" },
      })
      return NextResponse.json({ quotes })
    }

    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  } catch (err) {
    console.error("Quotes GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any
  const body = await req.json()

  try {
    if (user.role === "OWNER" && body.action === "request") {
      const data = createSchema.parse(body)
      const quote = await prisma.quote.create({
        data: {
          ownerId: user.id,
          vehicleId: data.vehicleId,
          garageId: data.garageId,
          serviceType: data.serviceType as any,
          description: data.description,
          status: "PENDING",
        },
        include: { garage: { select: { name: true } }, vehicle: true },
      })
      await notifyGarage({
        garageId: data.garageId,
        type: "QUOTE_REQUESTED",
        title: "New quote request",
        body: `${data.serviceType} request for ${quote.vehicle.year} ${quote.vehicle.make} ${quote.vehicle.model}`,
        link: garageLinks.enquiry(quote.id),
      })
      return NextResponse.json({ quote }, { status: 201 })
    }

    if (user.role === "GARAGE" && body.action === "respond") {
      const data = respondSchema.parse(body)
      const garage = await prisma.garage.findUnique({ where: { userId: user.id } })
      if (!garage) return NextResponse.json({ error: "Garage not found" }, { status: 404 })

      const quote = await prisma.quote.findFirst({
        where: { id: data.quoteId, garageId: garage.id },
      })
      if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 })
      // A request can be quoted (or re-quoted while still open) — not once it's accepted, declined or expired.
      if (quote.status !== "PENDING" && quote.status !== "SENT") {
        return NextResponse.json({ error: `This request is ${quote.status.toLowerCase()} and can no longer be quoted` }, { status: 409 })
      }

      const validUntil = new Date()
      validUntil.setDate(validUntil.getDate() + data.validDays)

      const updated = await prisma.quote.update({
        where: { id: data.quoteId },
        data: {
          price: data.price,
          laborCost: data.laborCost,
          partsCost: data.partsCost,
          notes: data.notes,
          validUntil,
          status: "SENT",
        },
      })
      await notifyUser({
        userId: quote.ownerId,
        type: "QUOTE_RESPONDED",
        title: `${garage.name} sent you a quote`,
        body: data.price ? `Quoted £${data.price.toFixed(2)} for your ${quote.serviceType} request` : "New quote received",
        link: `/dashboard?quote=${quote.id}`,
      })
      return NextResponse.json({ quote: updated })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: err.errors }, { status: 400 })
    }
    console.error("Quotes POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
