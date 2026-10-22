import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { forbidden, withGarage } from "@/lib/garage-auth"
import { disallowedOwnJobFields, jobScope, scopeWhere, type JobScope } from "@/lib/org/own-jobs"
import { BookingError } from "@/lib/portal/booking-error"
import { rescheduleBooking, transitionBooking } from "@/lib/portal/booking-service"
import { BOOKING_STATUSES, canTransition } from "@/lib/portal/booking-status"
import { recordBookingEvent } from "@/lib/portal/booking-events"
import { BOOKING_DETAIL_SELECT, toBookingDetail } from "@/lib/portal/booking-rows"
import type { BookingStatus } from "@/types"

type Params = { id: string }

/** A booking of this location that the caller's scope reaches. A technician asking for someone else's job gets "not found". */
async function loadDetail(id: string, garageId: string, scope: JobScope = { kind: "all" }) {
  const row = await prisma.booking.findFirst({ where: { AND: [{ id, garageId }, scopeWhere(scope)] }, select: BOOKING_DETAIL_SELECT })
  if (!row) throw new BookingError("NOT_FOUND", "Booking not found")
  return row
}

export const GET = withGarage<Params>("Garage booking GET", async (_req, ctx, { id }) => {
  const scope = await jobScope(ctx, "bookings")
  if (!scope) return forbidden()
  return NextResponse.json({ booking: toBookingDetail(await loadDetail(id, ctx.garage.id, scope)) })
}, { permission: { anyOf: ["bookings.view", "bookings.viewOwn"] } })

const patchSchema = z
  .object({
    status: z.enum(BOOKING_STATUSES as [BookingStatus, ...BookingStatus[]]).optional(),
    cancelReason: z.string().trim().max(300).nullable().optional(),
    scheduledAt: z.string().datetime().optional(),
    durationMins: z.number().int().min(15).max(960).nullable().optional(),
    technicianId: z.string().max(40).nullable().optional(),
    allowOverlap: z.boolean().optional(),
    contacted: z.boolean().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    finalInvoiceValue: z.number().min(0).max(1_000_000).nullable().optional(),
    totalPrice: z.number().min(0).max(1_000_000).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Nothing to update")

export const PATCH = withGarage<Params>(
  "Garage booking PATCH",
  async (req, ctx, { id }) => {
    const { garage } = ctx
    const raw = await req.json()
    const data = patchSchema.parse(raw)
    // bookings.manage changes anything at the location; bookings.updateOwn only the caller's own jobs, and only to record
    // that work started, finished or didn't happen, plus notes.
    const scope = await jobScope(ctx, "bookings", "update")
    if (!scope) return forbidden()
    const booking = await prisma.booking.findFirst({ where: { AND: [{ id, garageId: garage.id }, scopeWhere(scope)] } })
    if (!booking) throw new BookingError("NOT_FOUND", "Booking not found")
    if (scope.kind === "own" && disallowedOwnJobFields(data).length > 0) return forbidden()
    const now = new Date()

    // Validate the status change up front so a rejected transition can't leave a half-applied update.
    if (data.status && data.status !== booking.status) {
      const check = canTransition(booking.status, data.status, "GARAGE", booking.scheduledAt, now)
      if (!check.ok) throw new BookingError(check.code, check.message)
    }

    // 1. Placement (time / duration / technician): validates overlaps and the past.
    const placementChanged =
      data.scheduledAt !== undefined || data.durationMins !== undefined || data.technicianId !== undefined
    if (placementChanged) {
      await rescheduleBooking({
        bookingId: booking.id,
        garageId: garage.id,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
        durationMins: data.durationMins,
        technicianId: data.technicianId,
        allowOverlap: data.allowOverlap,
        now,
      })
    }

    // 2. Plain fields.
    const fields: Record<string, unknown> = {}
    if (data.contacted !== undefined) fields.contactedAt = data.contacted ? (booking.contactedAt ?? now) : null
    if (data.notes !== undefined) fields.notes = data.notes || null
    if (data.totalPrice !== undefined) fields.totalPrice = data.totalPrice
    // finalInvoiceValue travels with a status change (so it's saved atomically with it).
    const statusChanging = data.status !== undefined && data.status !== booking.status
    if (data.finalInvoiceValue !== undefined && !statusChanging) fields.finalInvoiceValue = data.finalInvoiceValue
    if (Object.keys(fields).length > 0) {
      await prisma.booking.update({ where: { id: booking.id }, data: fields })
      if (data.contacted === true && !booking.contactedAt) await recordBookingEvent(prisma, { bookingId: booking.id, actorType: "GARAGE", type: "CONTACTED", detail: "Marked as contacted" })
      if (data.notes !== undefined && (data.notes || null) !== booking.notes) await recordBookingEvent(prisma, { bookingId: booking.id, actorType: "GARAGE", type: "NOTE", detail: "Internal notes updated" })
    }

    // 3. Status.
    if (statusChanging) {
      await transitionBooking({
        bookingId: booking.id,
        to: data.status!,
        actor: { role: "GARAGE", garageId: garage.id },
        cancelReason: data.cancelReason,
        finalInvoiceValue: data.finalInvoiceValue,
        allowOverlap: data.allowOverlap,
        now,
      })
    }

    return NextResponse.json({ booking: toBookingDetail(await loadDetail(id, garage.id, scope)) })
  },
  { permission: { anyOf: ["bookings.manage", "bookings.updateOwn"] }, write: true }
)
