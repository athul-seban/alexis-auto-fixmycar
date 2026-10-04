import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { notifyGarage } from "@/lib/notifications"
import { garageReviewEmail } from "@/lib/email-templates"
import { BookingError } from "@/lib/portal/booking-error"
import { recordBookingEvent, type EventActor } from "@/lib/portal/booking-events"
import { emailGarage } from "@/lib/portal/garage-email"
import { absoluteUrl, garageLinks } from "@/lib/portal/links"
import { ratingAfterAdd } from "@/lib/portal/ratings"

export const reviewInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).optional(),
  comment: z.string().min(10).max(2000),
})
export type ReviewInput = z.infer<typeof reviewInputSchema>

/**
 * Create the one review a completed booking can have and fold it into the garage's public rating.
 * Used by signed-in customers (ownership checked by the caller) and by the email-link page (the token is the proof).
 */
export async function submitReview(bookingId: string, input: ReviewInput, actor: EventActor) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { review: true } })
  if (!booking) throw new BookingError("NOT_FOUND", "Booking not found")
  if (booking.status !== "COMPLETED") throw new BookingError("CONFLICT", "You can only review completed bookings")
  if (booking.review) throw new BookingError("CONFLICT", "You've already reviewed this booking")

  const review = await prisma.review.create({
    data: {
      ownerId: booking.ownerId,
      customerName: booking.customerName,
      garageId: booking.garageId,
      bookingId: booking.id,
      rating: input.rating,
      title: input.title,
      comment: input.comment,
    },
  })

  const garage = await prisma.garage.findUnique({ where: { id: booking.garageId } })
  if (garage) await prisma.garage.update({ where: { id: garage.id }, data: ratingAfterAdd(garage, input.rating) })

  await recordBookingEvent(prisma, { bookingId: booking.id, actorType: actor, type: "REVIEW", detail: `${input.rating}-star review left` })
  await notifyGarage({
    garageId: booking.garageId,
    type: "REVIEW_RECEIVED",
    title: `New ${input.rating}-star review`,
    body: input.comment.slice(0, 140),
    link: garageLinks.reviews,
  })
  await emailGarage(booking.garageId, "emailReview", (g) =>
    garageReviewEmail({ garageName: g.name, rating: input.rating, comment: input.comment, ctaHref: absoluteUrl(garageLinks.reviews) })
  )
  return review
}
