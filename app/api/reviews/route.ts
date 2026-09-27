import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { notifyGarage } from "@/lib/notifications"
import { z } from "zod"

const createSchema = z.object({
  bookingId: z.string(),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).optional(),
  comment: z.string().min(10).max(2000),
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any
  if (user.role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    const booking = await prisma.booking.findUnique({ where: { id: data.bookingId }, include: { review: true } })
    if (!booking || booking.ownerId !== user.id) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    }
    if (booking.status !== "COMPLETED") {
      return NextResponse.json({ error: "You can only review completed bookings" }, { status: 409 })
    }
    if (booking.review) {
      return NextResponse.json({ error: "You've already reviewed this booking" }, { status: 409 })
    }

    const review = await prisma.review.create({
      data: {
        ownerId: user.id,
        garageId: booking.garageId,
        bookingId: booking.id,
        rating: data.rating,
        title: data.title,
        comment: data.comment,
      },
    })

    const garage = await prisma.garage.findUnique({ where: { id: booking.garageId } })
    if (garage) {
      const newTotal = garage.totalReviews + 1
      const newAverage = (garage.averageRating * garage.totalReviews + data.rating) / newTotal
      await prisma.garage.update({
        where: { id: garage.id },
        data: { totalReviews: newTotal, averageRating: newAverage },
      })
    }

    await notifyGarage({
      garageId: booking.garageId,
      type: "REVIEW_RECEIVED",
      title: `New ${data.rating}-star review`,
      body: data.comment.slice(0, 140),
      link: `/garage-dashboard?booking=${booking.id}`,
    })

    return NextResponse.json({ review }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: err.errors }, { status: 400 })
    }
    console.error("Reviews POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
