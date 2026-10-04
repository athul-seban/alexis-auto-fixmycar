import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { BookingError } from "@/lib/portal/booking-error"
import { notifyUser } from "@/lib/notifications"

const schema = z.object({ reply: z.string().trim().min(1, "Write a reply").max(1000, "Replies can be at most 1000 characters").nullable() })

/** Publicly reply to a review (or remove your reply with `{ reply: null }`). One reply per review; editing replaces it. */
export const PATCH = withGarage<{ id: string }>(
  "Garage review PATCH",
  async (req, { garage }, { id }) => {
    const { reply } = schema.parse(await req.json())
    const review = await prisma.review.findFirst({ where: { id, garageId: garage.id } })
    if (!review) throw new BookingError("NOT_FOUND", "Review not found")

    const updated = await prisma.review.update({
      where: { id },
      data: reply === null ? { reply: null, repliedAt: null } : { reply, repliedAt: new Date() },
    })

    // Tell the customer on first reply only (editing a reply shouldn't re-notify).
    if (reply !== null && review.reply === null && review.ownerId) {
      await notifyUser({
        userId: review.ownerId,
        type: "REVIEW_REPLY",
        title: `${garage.name} replied to your review`,
        body: reply.slice(0, 140),
        link: "/dashboard",
      })
    }

    return NextResponse.json({
      review: { id: updated.id, reply: updated.reply, repliedAt: updated.repliedAt?.toISOString() ?? null },
    })
  },
  { write: true }
)
