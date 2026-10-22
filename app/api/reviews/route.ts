import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleRouteError } from "@/lib/portal/route-errors"
import { reviewInputSchema, submitReview } from "@/lib/portal/review-service"
import { z } from "zod"
import { requireSession } from "@/lib/session"
import { limitByKey } from "@/lib/rate-limit"

const createSchema = reviewInputSchema.extend({ bookingId: z.string() })

export async function POST(req: Request) {
  const auth = await requireSession()
  if (!auth.ok) return auth.response
  const { user } = auth
  if (user.role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const limited = await limitByKey("reviews", user.id, 20, 10 * 60_000)
  if (limited) return limited

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
