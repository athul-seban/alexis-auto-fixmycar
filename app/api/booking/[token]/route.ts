import { NextResponse } from "next/server"
import { limitByIp, rateLimit, tooManyRequests } from "@/lib/rate-limit"
import { z } from "zod"
import { notifyGarage } from "@/lib/notifications"
import { BookingError } from "@/lib/portal/booking-error"
import { rescheduleBooking, transitionBooking } from "@/lib/portal/booking-service"
import { displayStatus } from "@/lib/portal/booking-status"
import { garageLinks } from "@/lib/portal/links"
import { handleRouteError } from "@/lib/portal/route-errors"
import { reviewInputSchema, submitReview } from "@/lib/portal/review-service"
import { londonDateString, formatLondonDateTime } from "@/lib/portal/tz"
import { loadRescheduleContext } from "@/lib/portal/customer-reschedule"
import { loadByToken } from "@/lib/portal/booking-token"

type Params = { token: string }

async function view(b: Awaited<ReturnType<typeof loadByToken>>) {
  const active = ["PENDING", "CONFIRMED"].includes(b.status)
  return {
    reference: b.reference,
    serviceType: b.serviceType,
    status: b.status,
    displayStatus: displayStatus(b),
    scheduledAt: b.scheduledAt.toISOString(),
    timeConfirmed: b.timeConfirmed,
    totalPrice: b.totalPrice,
    customerName: b.customerName,
    vehicle: [b.vehicleYear, b.vehicleMake, b.vehicleModel].filter(Boolean).join(" ") || b.vrm,
    vrm: b.vrm,
    cancelReason: b.cancelReason,
    garage: b.garage,
    review: b.review,
    canCancel: active,
    // Moving a booking needs the garage's online slot rules, so it's only offered when its widget is on.
    canReschedule: active && b.scheduledAt.getTime() > Date.now() && (await loadRescheduleContext(b)) !== null,
    canReview: b.status === "COMPLETED" && !b.review,
  }
}

const noStore = { headers: { "Cache-Control": "no-store" } }

export async function GET(_req: Request, props: { params: Promise<Params> }) {
  try {
    const { token } = await props.params
    return NextResponse.json({ booking: await view(await loadByToken(token)) }, noStore)
  } catch (err) {
    return handleRouteError(err, "Booking manage GET")
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), reason: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("reschedule"), start: z.string().datetime() }),
  z.object({ action: z.literal("review") }).merge(reviewInputSchema),
])

export async function POST(req: Request, props: { params: Promise<Params> }) {
  try {
    const { token } = await props.params
    // Actions on a manage link are rare in real use; cap them per link and per visitor.
    const perLink = await rateLimit(`manage:token:${token}`, 30, 10 * 60 * 1000)
    if (!perLink.ok) return tooManyRequests(perLink.retryAfter)
    const limited = await limitByIp(req.headers, "manage", 60, 10 * 60 * 1000)
    if (limited) return limited

    const booking = await loadByToken(token)
    const body = actionSchema.parse(await req.json())

    if (body.action === "cancel") {
      await transitionBooking({ bookingId: booking.id, to: "CANCELLED", actor: { role: "OWNER", viaToken: true }, cancelReason: body.reason ?? "Cancelled by customer" })
    } else if (body.action === "reschedule") {
      const ctx = await loadRescheduleContext(booking)
      if (!ctx || !["PENDING", "CONFIRMED"].includes(booking.status)) {
        throw new BookingError("NOT_ACTIVE", "This booking can't be moved online — please call the garage")
      }
      const start = new Date(body.start)
      const slots = await ctx.slotsFor(londonDateString(start))
      // Only a start time the garage actually offers (opening hours, lead time, capacity) is accepted.
      if (!slots.some((s) => s.start.getTime() === start.getTime())) {
        return NextResponse.json({ error: "That time isn't available — please choose another.", code: "slot_taken" }, { status: 409 })
      }
      try {
        await rescheduleBooking({ bookingId: booking.id, garageId: booking.garageId, scheduledAt: start, durationMins: ctx.durationMins, actor: "CUSTOMER" })
      } catch (err) {
        if (err instanceof BookingError && err.code === "OVERLAP") {
          return NextResponse.json({ error: "Sorry, that time has just been taken — please choose another.", code: "slot_taken" }, { status: 409 })
        }
        throw err
      }
      await notifyGarage({
        garageId: booking.garageId,
        type: "BOOKING_STATUS_CHANGED",
        title: "Customer moved a booking",
        body: `${booking.customerName ?? "A customer"} moved their ${booking.serviceType} booking to ${formatLondonDateTime(start)}`,
        link: garageLinks.booking(booking.id),
      })
    } else {
      const { action: _action, ...input } = body
      await submitReview(booking.id, input, "CUSTOMER")
    }
    return NextResponse.json({ booking: await view(await loadByToken(token)) }, noStore)
  } catch (err) {
    return handleRouteError(err, "Booking manage POST")
  }
}
