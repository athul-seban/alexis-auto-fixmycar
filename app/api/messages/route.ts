import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { notifyUser, notifyGarage } from "@/lib/notifications"
import { garageLinks } from "@/lib/portal/links"
import { z } from "zod"

const querySchema = z.object({
  quoteId: z.string().optional(),
  bookingId: z.string().optional(),
})

const sendSchema = z
  .object({
    quoteId: z.string().optional(),
    bookingId: z.string().optional(),
    body: z.string().min(1).max(2000),
  })
  .refine((d) => d.quoteId || d.bookingId, { message: "quoteId or bookingId required" })

async function resolveThreadParty(quoteId?: string, bookingId?: string) {
  if (quoteId) {
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      select: { ownerId: true, garageId: true },
    })
    return quote
  }
  if (bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { ownerId: true, garageId: true },
    })
    return booking
  }
  return null
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any
  const { searchParams } = new URL(req.url)
  const parsed = querySchema.parse({
    quoteId: searchParams.get("quoteId") ?? undefined,
    bookingId: searchParams.get("bookingId") ?? undefined,
  })

  if (!parsed.quoteId && !parsed.bookingId) {
    return NextResponse.json({ error: "quoteId or bookingId required" }, { status: 400 })
  }

  try {
    const thread = await resolveThreadParty(parsed.quoteId, parsed.bookingId)
    if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 })

    const garage = user.role === "GARAGE" ? await prisma.garage.findUnique({ where: { userId: user.id } }) : null
    const isOwnerParty = user.role === "OWNER" && user.id === thread.ownerId
    const isGarageParty = user.role === "GARAGE" && garage?.id === thread.garageId
    if (!isOwnerParty && !isGarageParty && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const messages = await prisma.message.findMany({
      where: parsed.quoteId ? { quoteId: parsed.quoteId } : { bookingId: parsed.bookingId },
      include: { sender: { select: { id: true, name: true, role: true, image: true } } },
      orderBy: { createdAt: "asc" },
    })

    return NextResponse.json({ messages })
  } catch (err) {
    console.error("Messages GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any

  try {
    const body = await req.json()
    const data = sendSchema.parse(body)

    const thread = await resolveThreadParty(data.quoteId, data.bookingId)
    if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 })

    const garage = user.role === "GARAGE" ? await prisma.garage.findUnique({ where: { userId: user.id } }) : null
    const isOwnerParty = user.role === "OWNER" && user.id === thread.ownerId
    const isGarageParty = user.role === "GARAGE" && garage?.id === thread.garageId
    if (!isOwnerParty && !isGarageParty) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    // Walk-in / widget bookings have no customer account to message.
    if (!thread.ownerId) {
      return NextResponse.json(
        { error: "This customer doesn't have an account — contact them by phone or email instead." },
        { status: 409 }
      )
    }

    const message = await prisma.message.create({
      data: {
        quoteId: data.quoteId,
        bookingId: data.bookingId,
        senderId: user.id,
        garageId: thread.garageId,
        body: data.body,
      },
      include: { sender: { select: { id: true, name: true, role: true, image: true } } },
    })

    const link = data.quoteId ? `/dashboard?quote=${data.quoteId}` : `/dashboard?booking=${data.bookingId}`
    if (isOwnerParty) {
      await notifyGarage({
        garageId: thread.garageId,
        type: "MESSAGE_RECEIVED",
        title: "New message",
        body: data.body.slice(0, 140),
        link: data.quoteId ? garageLinks.enquiry(data.quoteId) : garageLinks.booking(data.bookingId!),
      })
    } else {
      await notifyUser({
        userId: thread.ownerId,
        type: "MESSAGE_RECEIVED",
        title: "New message",
        body: data.body.slice(0, 140),
        link,
      })
    }

    return NextResponse.json({ message }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: err.errors }, { status: 400 })
    }
    console.error("Messages POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
