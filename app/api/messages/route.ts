import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { notifyUser, notifyGarage } from "@/lib/notifications"
import { absoluteUrl, garageLinks } from "@/lib/portal/links"
import { emailGarage } from "@/lib/portal/garage-email"
import { sendMail } from "@/lib/mail"
import { messageReceivedEmail } from "@/lib/email-templates"
import { isFirstUnreadFromSender, markThreadRead } from "@/lib/messaging"
import { getServiceLabel } from "@/lib/utils"
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

async function emailOtherParty(a: {
  isOwnerParty: boolean
  thread: { ownerId: string | null; garageId: string }
  quoteId?: string
  bookingId?: string
  sender: { name: string | null }
  body: string
}) {
  const [garage, subject] = await Promise.all([
    prisma.garage.findUnique({ where: { id: a.thread.garageId }, select: { name: true } }),
    a.quoteId
      ? prisma.quote.findUnique({ where: { id: a.quoteId }, select: { serviceType: true } })
      : prisma.booking.findUnique({ where: { id: a.bookingId }, select: { serviceType: true } }),
  ])
  const about = `${a.quoteId ? "quote" : "booking"} for ${getServiceLabel(subject?.serviceType ?? "")}`.trim()

  if (a.isOwnerParty) {
    await emailGarage(a.thread.garageId, "emailMessage", (g) =>
      messageReceivedEmail({
        recipientName: g.name,
        fromName: a.sender.name ?? "A customer",
        about,
        preview: a.body,
        href: absoluteUrl(a.quoteId ? garageLinks.enquiry(a.quoteId) : garageLinks.booking(a.bookingId!)),
      })
    )
  } else if (a.thread.ownerId) {
    const owner = await prisma.user.findUnique({ where: { id: a.thread.ownerId }, select: { name: true, email: true, emailNotifications: true } })
    if (owner?.emailNotifications) {
      await sendMail({
        to: owner.email,
        ...messageReceivedEmail({ recipientName: owner.name, fromName: garage?.name ?? "Your garage", about, preview: a.body, href: absoluteUrl("/dashboard/messages") }),
      })
    }
  }
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
    // Opening the thread reads it (an admin looking in doesn't count as the recipient reading it).
    if (user.role !== "ADMIN") await markThreadRead(user.id, parsed.quoteId ? { quoteId: parsed.quoteId } : { bookingId: parsed.bookingId! })

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

    // Email the other side, but only for the first unread message of a burst. Never let a mail failure fail the send.
    try {
      if (await isFirstUnreadFromSender(message)) await emailOtherParty({ isOwnerParty, thread: { ownerId: thread.ownerId, garageId: thread.garageId }, quoteId: data.quoteId, bookingId: data.bookingId, sender: message.sender, body: data.body })
    } catch (err) {
      console.error("Messages email error:", err)
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
