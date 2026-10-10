import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { BookingError } from "@/lib/portal/booking-error"

const schema = z.object({
  reason: z.string().trim().min(10, "Tell us why you think this review should be removed (at least 10 characters)").max(500, "Keep the reason under 500 characters"),
})

/**
 * Ask an admin to remove a review (fake, abusive, about a different garage...). One dispute per review: a rejected
 * dispute can't be resubmitted, so it can't be used to wear the moderators down.
 */
export const POST = withGarage<{ id: string }>(
  "Garage review dispute POST",
  async (req, { garage }, { id }) => {
    const { reason } = schema.parse(await req.json())
    const review = await prisma.review.findFirst({ where: { id, garageId: garage.id }, select: { id: true } })
    if (!review) throw new BookingError("NOT_FOUND", "Review not found")

    // Claimed only while no dispute exists, so a double-click can't open two.
    const claimed = await prisma.review.updateMany({
      where: { id, disputeStatus: null },
      data: { disputeStatus: "OPEN", disputeReason: reason, disputedAt: new Date() },
    })
    if (claimed.count === 0) return NextResponse.json({ error: "This review has already been disputed." }, { status: 409 })
    return NextResponse.json({ success: true }, { status: 201 })
  },
  { write: true }
)
