import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { BookingError } from "@/lib/portal/booking-error"
import { recordBookingEvent } from "@/lib/portal/booking-events"
import { transitionBooking } from "@/lib/portal/booking-service"

const MAX_BULK = 50

const schema = z.object({
  ids: z.array(z.string().max(40)).min(1, "Select at least one booking").max(MAX_BULK, `Select at most ${MAX_BULK} bookings at once`),
  action: z.enum(["confirm", "cancel", "contacted"]),
  cancelReason: z.string().trim().max(300).optional(),
})

export interface BulkResult {
  updated: string[]
  failed: { id: string; reason: string }[]
}

/**
 * Apply one action to many bookings. Each booking goes through the normal rules (a booking that can't make
 * the change is reported, not forced), so a bulk action can never do more than clicking through one by one.
 */
export const POST = withGarage(
  "Garage bookings bulk POST",
  async (req, { garage }) => {
    const { ids, action, cancelReason } = schema.parse(await req.json())
    const unique = [...new Set(ids)]
    const result: BulkResult = { updated: [], failed: [] }

    for (const id of unique) {
      try {
        if (action === "contacted") {
          const b = await prisma.booking.findFirst({ where: { id, garageId: garage.id }, select: { id: true, contactedAt: true } })
          if (!b) throw new BookingError("NOT_FOUND", "Booking not found")
          if (!b.contactedAt) {
            await prisma.booking.update({ where: { id }, data: { contactedAt: new Date() } })
            await recordBookingEvent(prisma, { bookingId: id, actorType: "GARAGE", type: "CONTACTED", detail: "Marked as contacted" })
          }
        } else {
          await transitionBooking({
            bookingId: id,
            to: action === "confirm" ? "CONFIRMED" : "CANCELLED",
            actor: { role: "GARAGE", garageId: garage.id },
            cancelReason: action === "cancel" ? (cancelReason ?? null) : undefined,
          })
        }
        result.updated.push(id)
      } catch (err) {
        if (!(err instanceof BookingError)) throw err
        result.failed.push({ id, reason: err.message })
      }
    }
    return NextResponse.json(result)
  },
  { write: true }
)
