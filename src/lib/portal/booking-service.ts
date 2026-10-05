import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { notifyGarage, notifyUser } from "@/lib/notifications"
import type { BookingSource, BookingStatus } from "@/types"
import { randomBytes } from "crypto"
import { refundOnCancel } from "@/lib/portal/payment-service"
import { notifyCustomerSms } from "@/lib/portal/sms-notify"
import { creationActor, recordBookingEvent, type EventActor } from "@/lib/portal/booking-events"
import { BookingError } from "@/lib/portal/booking-error"
import { generateReference } from "@/lib/portal/booking-ref"
import {
  ACTIVE_STATUSES,
  DEFAULT_DURATION_MINS,
  STATUS_LABELS,
  canTransition,
} from "@/lib/portal/booking-status"
import { bookingInterval, garageCapacity, hasCapacity, overlaps, type BusyInterval } from "@/lib/portal/availability"
import { absoluteUrl, garageLinks } from "@/lib/portal/links"
import { emailGarage } from "@/lib/portal/garage-email"
import { sourceLabel } from "@/lib/portal/labels"
import { formatLondonDateTime } from "@/lib/portal/tz"
import { garageBookingCancelledEmail, garageNewBookingEmail } from "@/lib/email-templates"
import { parsePortalSettings } from "@/lib/portal/portal-settings"
import { buildSearchText } from "@/lib/portal/search-text"
import { normaliseVrm } from "@/lib/portal/vrm"

type Db = Prisma.TransactionClient

/** Sources that count towards Garage.totalBookings ("bookings received"). */
const COUNTS_AS_RECEIVED: BookingSource[] = ["MARKETPLACE", "QUOTE", "JOB_REQUEST", "WIDGET"]

const DAY_MS = 24 * 3600 * 1000

/** Placeholder appointment time (from now) for bookings created without an explicit time. */
export const PLACEHOLDER_LEAD_MS = 3 * DAY_MS

/**
 * Who is acting. `viaToken` is a customer who proved they hold the booking's secret manage link (they may have no
 * account); the caller must have looked the booking up by that token, so no ownership check is made here.
 */
export type Actor = { role: "GARAGE"; garageId: string } | { role: "OWNER"; userId: string } | { role: "OWNER"; viaToken: true }

// ───────────────────────────── create ─────────────────────────────

export interface CreateBookingInput {
  garageId: string
  source: BookingSource
  serviceType: string
  scheduledAt: Date
  totalPrice: number
  durationMins?: number | null
  description?: string | null
  notes?: string | null
  status?: "PENDING" | "CONFIRMED"
  technicianId?: string | null
  /** False when the time is a placeholder (created from a quote/job without an explicit time). */
  timeConfirmed?: boolean
  // Links (an owner account exists)
  ownerId?: string | null
  vehicleId?: string | null
  quoteId?: string | null
  jobResponseId?: string | null
  // Snapshots — derived from owner/vehicle when omitted
  customerName?: string | null
  customerEmail?: string | null
  customerPhone?: string | null
  /** The customer agreed to be texted about this booking. */
  smsOptIn?: boolean
  vrm?: string | null
  vehicleMake?: string | null
  vehicleModel?: string | null
  vehicleYear?: number | null
  ipHash?: string | null
  /** Require the garage to be APPROVED. Defaults to true except for the garage's own DIRECT bookings. */
  enforceApproved?: boolean
  /** Send the in-app "new booking" notification to the garage. Defaults to true except for DIRECT. */
  notify?: boolean
  /**
   * Re-check availability (capacity, time off, technician) inside the creating transaction,
   * under the garage lock, and throw OVERLAP if the slot is no longer free. Use for any
   * customer-facing or capacity-respecting creation so simultaneous requests can't double-book.
   */
  checkAvailability?: boolean
}

const BOOKING_INCLUDE = {
  vehicle: true,
  garage: { select: { name: true, city: true } },
} satisfies Prisma.BookingInclude

async function uniqueReference(db: Db): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const ref = generateReference()
    if (!(await db.booking.findUnique({ where: { reference: ref }, select: { id: true } }))) return ref
  }
  throw new BookingError("CONFLICT", "Could not allocate a booking reference — please retry")
}

async function createInTx(db: Db, input: CreateBookingInput) {
  if (input.ownerId && !input.vehicleId) {
    throw new BookingError("INVALID_INPUT", "A booking linked to an owner account needs a vehicle")
  }
  if (!(input.totalPrice >= 0)) throw new BookingError("INVALID_INPUT", "Price cannot be negative")

  // Take the garage lock FIRST. A transaction that reads and only later writes can't be upgraded to a writer on SQLite
  // when another transaction has written in between (it fails instead of waiting), so the write has to come first.
  if (input.checkAvailability) await lockGarage(db, input.garageId)

  const garage = await db.garage.findUnique({ where: { id: input.garageId }, select: { id: true, status: true } })
  if (!garage) throw new BookingError("NOT_FOUND", "Garage not found")
  const enforce = input.enforceApproved ?? input.source !== "DIRECT"
  if (enforce && garage.status !== "APPROVED") {
    throw new BookingError("GARAGE_NOT_APPROVED", "This garage is not currently accepting bookings")
  }

  if (input.technicianId) {
    const tech = await db.technician.findFirst({ where: { id: input.technicianId, garageId: input.garageId } })
    if (!tech) throw new BookingError("INVALID_INPUT", "Technician not found for this garage")
  }

  if (input.checkAvailability) {
    const o = await findOverlaps(
      { garageId: input.garageId, start: input.scheduledAt, durationMins: input.durationMins, technicianId: input.technicianId },
      db
    )
    if (!o.available) throw overlapError(o)
  }

  // Snapshot customer + vehicle details, preferring what the caller supplied.
  let { customerName, customerEmail, customerPhone, vrm, vehicleMake, vehicleModel, vehicleYear } = input
  if (input.ownerId) {
    const owner = await db.user.findUnique({
      where: { id: input.ownerId },
      select: { name: true, email: true, phone: true },
    })
    if (!owner) throw new BookingError("NOT_FOUND", "Customer account not found")
    customerName ??= owner.name
    customerEmail ??= owner.email
    customerPhone ??= owner.phone
  }
  if (input.vehicleId) {
    const vehicle = await db.vehicle.findUnique({ where: { id: input.vehicleId } })
    if (!vehicle) throw new BookingError("NOT_FOUND", "Vehicle not found")
    if (input.ownerId && vehicle.ownerId !== input.ownerId) {
      throw new BookingError("VEHICLE_NOT_OWNED", "That vehicle does not belong to this customer")
    }
    vrm ??= vehicle.registration
    vehicleMake ??= vehicle.make
    vehicleModel ??= vehicle.model
    vehicleYear ??= vehicle.year
  }

  if (input.quoteId) {
    const quote = await db.quote.findUnique({ where: { id: input.quoteId }, include: { booking: { select: { id: true } } } })
    if (!quote || quote.garageId !== input.garageId || (input.ownerId && quote.ownerId !== input.ownerId)) {
      throw new BookingError("QUOTE_MISMATCH", "That quote does not belong to this garage and customer")
    }
    if (quote.booking) throw new BookingError("CONFLICT", "That quote has already been booked")
    // Only a priced, still-open quote can be booked (not an unpriced, declined or expired one).
    if (quote.status !== "SENT") throw new BookingError("CONFLICT", "That quote isn't open for booking")
  }

  const reference = await uniqueReference(db)
  const normalisedVrm = normaliseVrm(vrm) || null

  const booking = await db.booking.create({
    data: {
      garageId: input.garageId,
      ownerId: input.ownerId ?? null,
      vehicleId: input.vehicleId ?? null,
      quoteId: input.quoteId ?? null,
      jobResponseId: input.jobResponseId ?? null,
      serviceType: input.serviceType,
      description: input.description ?? null,
      notes: input.notes ?? null,
      status: input.status ?? "PENDING",
      scheduledAt: input.scheduledAt,
      durationMins: input.durationMins ?? null,
      totalPrice: input.totalPrice,
      technicianId: input.technicianId ?? null,
      timeConfirmed: input.timeConfirmed ?? true,
      source: input.source,
      reference,
      manageToken: randomBytes(16).toString("hex"),
      customerName: customerName ?? null,
      customerEmail: customerEmail ?? null,
      customerPhone: customerPhone ?? null,
      smsOptIn: input.smsOptIn ?? false,
      vrm: normalisedVrm,
      vehicleMake: vehicleMake ?? null,
      vehicleModel: vehicleModel ?? null,
      vehicleYear: vehicleYear ?? null,
      ipHash: input.ipHash ?? null,
      searchText: buildSearchText({
        customerName, customerEmail, customerPhone, vrm: normalisedVrm, vehicleMake, vehicleModel, reference,
      }),
    },
    include: BOOKING_INCLUDE,
  })

  await recordBookingEvent(db, { bookingId: booking.id, actorType: creationActor(input.source), type: "CREATED", detail: `Booked via ${sourceLabel(input.source)}` })

  if (input.quoteId) {
    await db.quote.update({ where: { id: input.quoteId }, data: { status: "ACCEPTED" } })
  }
  if (COUNTS_AS_RECEIVED.includes(input.source)) {
    await db.garage.update({ where: { id: input.garageId }, data: { totalBookings: { increment: 1 } } })
  }
  return booking
}

export type CreatedBooking = Awaited<ReturnType<typeof createInTx>>

/**
 * The one place bookings are created. Pass `db` to join an existing transaction (the caller
 * then owns notification via `notifyBookingCreated`).
 */
export async function createBooking(input: CreateBookingInput, db?: Db): Promise<CreatedBooking> {
  const booking = db ? await createInTx(db, input) : await prisma.$transaction((tx) => createInTx(tx, input))
  if (!db && (input.notify ?? input.source !== "DIRECT")) {
    await notifyBookingCreated(booking)
    // Guest job bookings are emailed by the accept route (it already sends its own garage email).
    if (input.source !== "DIRECT" && input.source !== "JOB_REQUEST") {
      await emailGarage(booking.garageId, "emailNewBooking", (g) =>
        garageNewBookingEmail({
          garageName: g.name,
          customerName: booking.customerName,
          serviceType: booking.serviceType,
          whenLabel: formatLondonDateTime(booking.scheduledAt),
          vehicle: vehicleLabel(booking),
          reference: booking.reference,
          source: sourceLabel(booking.source),
          ctaHref: absoluteUrl(garageLinks.booking(booking.id)),
        })
      )
    }
  }
  return booking
}

export function vehicleLabel(b: { vehicleYear?: number | null; vehicleMake?: string | null; vehicleModel?: string | null; vrm?: string | null }): string {
  const label = [b.vehicleYear, b.vehicleMake, b.vehicleModel].filter(Boolean).join(" ")
  return label || b.vrm || "vehicle"
}

export async function notifyBookingCreated(booking: {
  id: string
  garageId: string
  serviceType: string
  vehicleYear?: number | null
  vehicleMake?: string | null
  vehicleModel?: string | null
  vrm?: string | null
}) {
  return notifyGarage({
    garageId: booking.garageId,
    type: "BOOKING_CREATED",
    title: "New booking",
    body: `${booking.serviceType} booking for ${vehicleLabel(booking)}`,
    link: garageLinks.booking(booking.id),
  })
}

/** Notify the customer only if they have an account (walk-in/widget customers don't). */
export async function notifyBookingOwner(
  booking: { id: string; ownerId: string | null },
  payload: { type: Parameters<typeof notifyUser>[0]["type"]; title: string; body: string }
) {
  if (!booking.ownerId) return null
  return notifyUser({ userId: booking.ownerId, ...payload, link: `/dashboard?booking=${booking.id}` })
}

// ──────────────────────────── transition ────────────────────────────

export interface TransitionInput {
  bookingId: string
  to: BookingStatus
  actor: Actor
  cancelReason?: string | null
  finalInvoiceValue?: number | null
  /** Reinstating a cancelled booking into a now-occupied slot needs this explicit override. */
  allowOverlap?: boolean
  now?: Date
}

export async function transitionBooking(input: TransitionInput) {
  const now = input.now ?? new Date()
  const booking = await prisma.booking.findUnique({ where: { id: input.bookingId } })
  if (!booking) throw new BookingError("NOT_FOUND", "Booking not found")

  const actor = input.actor
  const notAllowed = actor.role === "GARAGE" ? booking.garageId !== actor.garageId : "viaToken" in actor ? false : booking.ownerId !== actor.userId
  if (notAllowed) {
    throw new BookingError("FORBIDDEN", "Forbidden")
  }

  const check = canTransition(booking.status, input.to, input.actor.role, booking.scheduledAt, now)
  if (!check.ok) throw new BookingError(check.code, check.message)

  // Reinstating a cancelled booking puts it back in the diary, so its slot must still be free
  // (the garage may have taken it since). Past bookings are just history and aren't checked.
  if (booking.status === "CANCELLED" && input.to === "PENDING" && !input.allowOverlap && booking.scheduledAt > now) {
    const o = await findOverlaps({
      garageId: booking.garageId, start: booking.scheduledAt, durationMins: booking.durationMins,
      technicianId: booking.technicianId, excludeBookingId: booking.id,
    })
    if (!o.available) throw overlapError(o)
  }

  const data: Prisma.BookingUpdateManyMutationInput = { status: input.to }
  if (input.to === "COMPLETED") data.completedAt = now
  if (input.to === "CONFIRMED") data.timeConfirmed = true // confirming acknowledges the time
  if (input.to === "CANCELLED") data.cancelReason = input.cancelReason ?? null
  if (input.to === "PENDING") {
    data.cancelReason = null // reinstated
    data.completedAt = null
  }
  if (input.finalInvoiceValue !== undefined) data.finalInvoiceValue = input.finalInvoiceValue

  // Compare-and-swap on status so two concurrent changes can't both "win".
  const { count } = await prisma.booking.updateMany({
    where: { id: booking.id, status: booking.status },
    data,
  })
  if (count === 0) throw new BookingError("CONFLICT", "This booking was just changed — refresh and try again")

  const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })
  const label = STATUS_LABELS[input.to].toLowerCase()
  // A cancelled booking gives its deposit back per the garage's policy (full if the garage cancelled).
  if (input.to === "CANCELLED") await refundOnCancel(booking.id, input.actor.role === "GARAGE" ? "GARAGE" : "CUSTOMER", now)
  await recordBookingEvent(prisma, {
    bookingId: booking.id,
    actorType: "viaToken" in input.actor ? "CUSTOMER" : input.actor.role,
    type: "STATUS",
    detail: `${STATUS_LABELS[booking.status as BookingStatus] ?? booking.status} → ${STATUS_LABELS[input.to]}${input.to === "CANCELLED" && input.cancelReason ? ` (${input.cancelReason})` : ""}`,
  })

  if (input.actor.role === "GARAGE") {
    // Customers who opted in to texts hear about a confirmation or cancellation straight away.
    if (input.to === "CONFIRMED") await notifyCustomerSms(updated.id, "CONFIRMED", now)
    if (input.to === "CANCELLED") await notifyCustomerSms(updated.id, "CANCELLED", now)
    await notifyBookingOwner(updated, {
      type: "BOOKING_STATUS_CHANGED",
      title: `Booking ${label}`,
      body: `Your ${updated.serviceType} booking is now ${label}`,
    })
  } else {
    await notifyGarage({
      garageId: updated.garageId,
      type: "BOOKING_STATUS_CHANGED",
      title: `Booking ${label}`,
      body: `A customer cancelled their ${updated.serviceType} booking`,
      link: garageLinks.booking(updated.id),
    })
    await emailGarage(updated.garageId, "emailCancellation", (g) =>
      garageBookingCancelledEmail({
        garageName: g.name,
        customerName: updated.customerName,
        serviceType: updated.serviceType,
        whenLabel: formatLondonDateTime(updated.scheduledAt),
        ctaHref: absoluteUrl(garageLinks.booking(updated.id)),
      })
    )
  }
  return updated
}

// ───────────────────────────── availability ─────────────────────────────

export interface BusyData {
  capacity: number
  bookings: (BusyInterval & { id: string; reference: string | null; customerName: string | null; vrm: string | null; scheduledAt: Date; durationMins: number | null; status: string })[]
  blocks: (BusyInterval & { id: string; reason: string | null })[]
}

/**
 * Serialises concurrent bookings for one garage. Touching the garage row takes a row lock held
 * until the surrounding transaction commits (Postgres), so a "check availability, then insert"
 * sequence inside the transaction can't interleave with another one. SQLite already serialises
 * writers. Portable: no advisory locks or raw SQL.
 */
async function lockGarage(db: Db, garageId: string) {
  // updateMany (not update) so a missing garage is reported by the caller's own NOT_FOUND check instead of throwing here.
  await db.garage.updateMany({ where: { id: garageId }, data: { updatedAt: new Date() } })
}

/**
 * Active bookings + diary blocks overlapping [start, end), and the garage's capacity. Bookings
 * whose time is only a placeholder (timeConfirmed = false) don't hold a slot.
 */
export async function getBusyForRange(garageId: string, start: Date, end: Date, excludeBookingId?: string, db: Db = prisma): Promise<BusyData> {
  const [garage, activeTechs, rows, blockRows] = await Promise.all([
    db.garage.findUnique({ where: { id: garageId }, select: { portalSettings: true } }),
    db.technician.count({ where: { garageId, isActive: true } }),
    db.booking.findMany({
      where: {
        garageId,
        status: { in: ACTIVE_STATUSES },
        timeConfirmed: true,
        // Durations are bounded, so anything starting >24h before the window can't reach it.
        scheduledAt: { gte: new Date(start.getTime() - DAY_MS), lt: end },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
      select: { id: true, reference: true, customerName: true, vrm: true, scheduledAt: true, durationMins: true, technicianId: true, status: true },
    }),
    db.diaryBlock.findMany({ where: { garageId, startAt: { lt: end }, endAt: { gt: start } } }),
  ])

  const bookings = rows
    .map((r) => ({ ...r, ...bookingInterval(r) }))
    .filter((b) => overlaps(start, end, b.start, b.end))
  const blocks = blockRows.map((b) => ({ id: b.id, reason: b.reason, start: b.startAt, end: b.endAt, technicianId: b.technicianId }))
  return { capacity: garageCapacity(activeTechs, parsePortalSettings(garage?.portalSettings).bays), bookings, blocks }
}

export interface OverlapResult {
  available: boolean
  reason: "FULL" | "BLOCKED" | "TECHNICIAN_BUSY" | null
  conflicts: BusyData["bookings"]
  blocks: BusyData["blocks"]
}

export async function findOverlaps(
  input: {
    garageId: string
    start: Date
    durationMins?: number | null
    technicianId?: string | null
    excludeBookingId?: string
  },
  db: Db = prisma
): Promise<OverlapResult> {
  const end = new Date(input.start.getTime() + (input.durationMins ?? DEFAULT_DURATION_MINS) * 60000)
  const { capacity, bookings, blocks } = await getBusyForRange(input.garageId, input.start, end, input.excludeBookingId, db)

  const techBusy =
    !!input.technicianId &&
    (bookings.some((b) => b.technicianId === input.technicianId) || blocks.some((b) => b.technicianId === input.technicianId))
  const garageBlocked = blocks.some((b) => !b.technicianId)
  const free = hasCapacity(input.start, end, capacity, bookings, blocks)

  const reason = garageBlocked ? "BLOCKED" : techBusy ? "TECHNICIAN_BUSY" : !free ? "FULL" : null
  return { available: reason === null, reason, conflicts: bookings, blocks }
}

// ──────────────────────────── reschedule ────────────────────────────

export interface RescheduleInput {
  bookingId: string
  garageId: string
  scheduledAt?: Date
  durationMins?: number | null
  technicianId?: string | null
  allowOverlap?: boolean
  /** Who is moving it (for the history); defaults to the garage. A customer move skips the customer notification. */
  actor?: EventActor
  now?: Date
}

export async function rescheduleBooking(input: RescheduleInput) {
  const now = input.now ?? new Date()
  const booking = await prisma.booking.findFirst({ where: { id: input.bookingId, garageId: input.garageId } })
  if (!booking) throw new BookingError("NOT_FOUND", "Booking not found")
  if (!ACTIVE_STATUSES.includes(booking.status as BookingStatus)) {
    throw new BookingError("NOT_ACTIVE", "Only pending, confirmed or in-progress bookings can be rescheduled")
  }

  const scheduledAt = input.scheduledAt ?? booking.scheduledAt
  const durationMins = input.durationMins !== undefined ? input.durationMins : booking.durationMins
  const technicianId = input.technicianId !== undefined ? input.technicianId : booking.technicianId
  const timeChanged = input.scheduledAt !== undefined && input.scheduledAt.getTime() !== booking.scheduledAt.getTime()

  if (timeChanged && scheduledAt.getTime() < now.getTime()) {
    throw new BookingError("PAST_TIME", "A booking cannot be moved into the past")
  }
  if (technicianId) {
    const tech = await prisma.technician.findFirst({ where: { id: technicianId, garageId: input.garageId } })
    if (!tech) throw new BookingError("INVALID_INPUT", "Technician not found for this garage")
  }

  const placementChanged = timeChanged || durationMins !== booking.durationMins || technicianId !== booking.technicianId
  // Check and write under the garage lock so two moves into the same slot can't both succeed.
  const updated = await prisma.$transaction(async (tx) => {
    if (placementChanged && !input.allowOverlap) {
      await lockGarage(tx, input.garageId)
      const o = await findOverlaps({ garageId: input.garageId, start: scheduledAt, durationMins, technicianId, excludeBookingId: booking.id }, tx)
      if (!o.available) throw overlapError(o)
    }
    return tx.booking.update({
      where: { id: booking.id },
      data: { scheduledAt, durationMins, technicianId, ...(timeChanged ? { timeConfirmed: true } : {}) },
    })
  })
  if (timeChanged) {
    await recordBookingEvent(prisma, { bookingId: booking.id, actorType: input.actor ?? "GARAGE", type: "RESCHEDULED", detail: `${formatLondonDateTime(booking.scheduledAt)} → ${formatLondonDateTime(updated.scheduledAt)}` })
  }
  if (technicianId !== booking.technicianId) {
    await recordBookingEvent(prisma, { bookingId: booking.id, actorType: input.actor ?? "GARAGE", type: "TECHNICIAN", detail: technicianId ? "Technician assigned" : "Technician removed" })
  }
  if (timeChanged && (input.actor ?? "GARAGE") === "GARAGE") {
    await notifyCustomerSms(updated.id, "RESCHEDULED", now)
    await notifyBookingOwner(updated, {
      type: "BOOKING_STATUS_CHANGED",
      title: "Booking rescheduled",
      body: `Your ${updated.serviceType} booking has been moved — check the new time in your dashboard`,
    })
  }
  return updated
}

export function overlapError(o: OverlapResult): BookingError {
  return new BookingError("OVERLAP", "That slot clashes with another booking or time off", {
    reason: o.reason,
    conflicts: o.conflicts.map(summariseConflict),
  })
}

export function summariseConflict(c: BusyData["bookings"][number]) {
  return { id: c.id, reference: c.reference, customerName: c.customerName, vrm: c.vrm, scheduledAt: c.scheduledAt, durationMins: c.durationMins }
}

// ───────────────────────── guest job acceptance ─────────────────────────

export interface AcceptJobInput {
  jobRequestId: string
  jobResponseId: string
  /** Explicit appointment time; otherwise the guest's preferred date, else a +3 day placeholder. */
  scheduledAt?: Date
}

/**
 * Turns a garage's job response into a booking: find-or-create the guest's (passwordless)
 * account + vehicle, create the booking, mark the response ACCEPTED, the rest DECLINED and
 * the request BOOKED — atomically.
 */
export async function acceptJobResponse(input: AcceptJobInput) {
  return prisma.$transaction(async (tx) => {
    const jobRequest = await tx.jobRequest.findUnique({ where: { id: input.jobRequestId } })
    if (!jobRequest) throw new BookingError("NOT_FOUND", "Job request not found")
    if (jobRequest.status === "BOOKED") throw new BookingError("CONFLICT", "This job has already been booked")
    if (jobRequest.status === "CANCELLED") throw new BookingError("CONFLICT", "This job request was cancelled")
    // Claim the request first (compare-and-swap) so two concurrent accepts can't both create a booking.
    const claimed = await tx.jobRequest.updateMany({
      where: { id: jobRequest.id, status: { notIn: ["BOOKED", "CANCELLED"] } },
      data: { status: "BOOKED" },
    })
    if (claimed.count === 0) throw new BookingError("CONFLICT", "This job has already been booked")

    const jobResponse = await tx.jobResponse.findUnique({ where: { id: input.jobResponseId }, include: { garage: true } })
    if (!jobResponse || jobResponse.jobRequestId !== jobRequest.id) {
      throw new BookingError("NOT_FOUND", "Quote not found for this job request")
    }

    let user = await tx.user.findUnique({ where: { email: jobRequest.guestEmail } })
    if (!user) {
      user = await tx.user.create({
        data: { name: jobRequest.guestName, email: jobRequest.guestEmail, phone: jobRequest.guestPhone, role: "OWNER" },
      })
    }

    let vehicle = await tx.vehicle.findFirst({ where: { ownerId: user.id, registration: jobRequest.registration } })
    if (!vehicle) {
      vehicle = await tx.vehicle.create({
        data: {
          ownerId: user.id,
          registration: jobRequest.registration,
          make: jobRequest.make,
          model: jobRequest.model,
          year: jobRequest.year,
          fuel: jobRequest.fuel,
          mileage: jobRequest.mileage,
        },
      })
    }

    const explicitTime = input.scheduledAt ?? jobRequest.preferredDate ?? null
    const booking = await createBooking(
      {
        garageId: jobResponse.garageId,
        source: "JOB_REQUEST",
        ownerId: user.id,
        vehicleId: vehicle.id,
        jobResponseId: jobResponse.id,
        serviceType: jobRequest.serviceType,
        description: jobRequest.description,
        scheduledAt: explicitTime ?? new Date(Date.now() + PLACEHOLDER_LEAD_MS),
        timeConfirmed: explicitTime !== null,
        totalPrice: jobResponse.price,
        customerName: jobRequest.guestName,
        customerEmail: jobRequest.guestEmail,
        customerPhone: jobRequest.guestPhone,
      },
      tx
    )

    await tx.jobResponse.update({ where: { id: jobResponse.id }, data: { status: "ACCEPTED" } })
    await tx.jobResponse.updateMany({
      where: { jobRequestId: jobRequest.id, id: { not: jobResponse.id } },
      data: { status: "DECLINED" },
    })

    return { booking, jobRequest, jobResponse }
  })
}
