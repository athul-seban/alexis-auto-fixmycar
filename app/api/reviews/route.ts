import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { handleRouteError } from "@/lib/portal/route-errors"
import { reviewInputSchema, submitReview } from "@/lib/portal/review-service"
import { z } from "zod"

const createSchema = reviewInputSchema.extend({ bookingId: z.string() })

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any
  if (user.role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const { bookingId, ...input } = createSchema.parse(await req.json())

    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { ownerId: true } })
    if (!booking || booking.ownerId !== user.id) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    }

    const review = await submitReview(bookingId, input, "OWNER")
    return NextResponse.json({ review }, { status: 201 })
  } catch (err) {
    return handleRouteError(err, "Reviews POST")
  }
}
