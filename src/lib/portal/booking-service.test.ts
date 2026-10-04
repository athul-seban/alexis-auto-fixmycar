import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  createBooking,
  transitionBooking,
  rescheduleBooking,
  findOverlaps,
  acceptJobResponse,
} from "@/lib/portal/booking-service"
import { BookingError } from "@/lib/portal/booking-error"
import { isValidReference } from "@/lib/portal/booking-ref"
import { cleanupPrefix, makeGarage, makeOwner } from "@/test/fixtures"

const PREFIX = "bsvc-"
const DAY = 24 * 3600 * 1000
const inDays = (n: number, hour = 10) => {
  const d = new Date(Date.now() + n * DAY)
  d.setUTCHours(hour, 0, 0, 0)
  return d
}

const expectCode = async (p: Promise<unknown>, code: string) => {
  const err = await p.then(() => null, (e) => e)
  expect(err).toBeInstanceOf(BookingError)
  expect((err as BookingError).code).toBe(code)
}

beforeEach(() => cleanupPrefix(PREFIX))
afterAll(() => cleanupPrefix(PREFIX))

describe("createBooking", () => {
  it("creates a walk-in DIRECT booking with snapshots, a reference, and no counter bump or notification", async () => {
    const { garage } = await makeGarage(PREFIX)
    const b = await createBooking({
      garageId: garage.id,
      source: "DIRECT",
      serviceType: "MOT",
      scheduledAt: inDays(2),
      totalPrice: 55,
      customerName: "Walk In",
      customerPhone: "+44 7700 900123",
      vrm: "ab12 cde",
      vehicleMake: "Kia",
      vehicleModel: "Ceed",
    })

    expect(b.ownerId).toBeNull()
    expect(b.vehicleId).toBeNull()
    expect(isValidReference(b.reference!)).toBe(true)
    expect(b.vrm).toBe("AB12CDE")
    expect(b.status).toBe("PENDING")
    expect(b.timeConfirmed).toBe(true)
    expect(b.searchText).toContain("walk in")
    expect(b.searchText).toContain("07700900123")
    expect(b.searchText).toContain("ab12cde")

    const g = await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })
    expect(g.totalBookings).toBe(0)
    expect(await prisma.notification.count({ where: { garageId: garage.id } })).toBe(0)
  })

  it("derives snapshots from the owner and vehicle, bumps the counter and notifies the garage", async () => {
    const { garage } = await makeGarage(PREFIX)
    const { user, vehicle } = await makeOwner(PREFIX)
    const b = await createBooking({
      garageId: garage.id,
      source: "MARKETPLACE",
      ownerId: user.id,
      vehicleId: vehicle.id,
      serviceType: "MOT",
      scheduledAt: inDays(3),
      totalPrice: 60,
    })

    expect(b.customerName).toBe(user.name)
    expect(b.customerEmail).toBe(user.email)
    expect(b.vrm).toBe("AB12CDE")
    expect(b.vehicleMake).toBe("Ford")
    expect(b.vehicleYear).toBe(2019)

    const g = await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })
    expect(g.totalBookings).toBe(1)
    const n = await prisma.notification.findFirstOrThrow({ where: { garageId: garage.id } })
    expect(n.type).toBe("BOOKING_CREATED")
    expect(n.link).toBe(`/garage-dashboard/bookings?booking=${b.id}`)
  })

  it("rejects a vehicle that belongs to someone else", async () => {
    const { garage } = await makeGarage(PREFIX)
    const a = await makeOwner(PREFIX, "ownera")
    const other = await makeOwner(PREFIX, "ownerb")
    await expectCode(
      createBooking({
        garageId: garage.id, source: "MARKETPLACE", ownerId: a.user.id, vehicleId: other.vehicle.id,
        serviceType: "MOT", scheduledAt: inDays(2), totalPrice: 50,
      }),
      "VEHICLE_NOT_OWNED"
    )
  })

  it("rejects an owner-linked booking without a vehicle", async () => {
    const { garage } = await makeGarage(PREFIX)
    const { user } = await makeOwner(PREFIX)
    await expectCode(
      createBooking({ garageId: garage.id, source: "MARKETPLACE", ownerId: user.id, serviceType: "MOT", scheduledAt: inDays(2), totalPrice: 50 }),
      "INVALID_INPUT"
    )
  })

  it("rejects negative prices but allows price-on-request (0)", async () => {
    const { garage } = await makeGarage(PREFIX)
    await expectCode(
      createBooking({ garageId: garage.id, source: "DIRECT", serviceType: "MOT", scheduledAt: inDays(2), totalPrice: -1 }),
      "INVALID_INPUT"
    )
    const free = await createBooking({ garageId: garage.id, source: "DIRECT", serviceType: "MOT", scheduledAt: inDays(2), totalPrice: 0 })
    expect(free.totalPrice).toBe(0)
  })

  it("only lets approved garages receive marketplace bookings, but lets any garage record its own", async () => {
    const { garage } = await makeGarage(PREFIX, { status: "PENDING" })
    const { user, vehicle } = await makeOwner(PREFIX)
    await expectCode(
      createBooking({
        garageId: garage.id, source: "MARKETPLACE", ownerId: user.id, vehicleId: vehicle.id,
        serviceType: "MOT", scheduledAt: inDays(2), totalPrice: 50,
      }),
      "GARAGE_NOT_APPROVED"
    )
    const own = await createBooking({ garageId: garage.id, source: "DIRECT", serviceType: "MOT", scheduledAt: inDays(2), totalPrice: 50, customerName: "X" })
    expect(own.id).toBeTruthy()
  })

  it("books from a quote once, marks it ACCEPTED, and validates garage + owner", async () => {
    const { garage } = await makeGarage(PREFIX, { key: "g1" })
    const { garage: otherGarage } = await makeGarage(PREFIX, { key: "g2" })
    const { user, vehicle } = await makeOwner(PREFIX)
    const quote = await prisma.quote.create({
      data: { ownerId: user.id, vehicleId: vehicle.id, garageId: garage.id, serviceType: "MOT", description: "Needs an MOT test", status: "SENT", price: 70 },
    })
    const base = { source: "QUOTE" as const, ownerId: user.id, vehicleId: vehicle.id, quoteId: quote.id, serviceType: "MOT", scheduledAt: inDays(2), totalPrice: 70 }

    await expectCode(createBooking({ ...base, garageId: otherGarage.id }), "QUOTE_MISMATCH")

    const b = await createBooking({ ...base, garageId: garage.id })
    expect(b.quoteId).toBe(quote.id)
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("ACCEPTED")

    await expectCode(createBooking({ ...base, garageId: garage.id }), "CONFLICT")
  })

  it("rejects a technician from another garage", async () => {
    const { garage } = await makeGarage(PREFIX, { key: "g1" })
    const { garage: other } = await makeGarage(PREFIX, { key: "g2" })
    const tech = await prisma.technician.create({ data: { garageId: other.id, name: "Elsewhere" } })
    await expectCode(
      createBooking({ garageId: garage.id, source: "DIRECT", serviceType: "MOT", scheduledAt: inDays(2), totalPrice: 10, technicianId: tech.id }),
      "INVALID_INPUT"
    )
  })

  it("generates a distinct reference for every booking", async () => {
    const { garage } = await makeGarage(PREFIX)
    const refs = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const b = await createBooking({ garageId: garage.id, source: "DIRECT", serviceType: "MOT", scheduledAt: inDays(2 + i), totalPrice: 1 })
      refs.add(b.reference!)
    }
    expect(refs.size).toBe(10)
  })
})

describe("transitionBooking", () => {
  const setup = async (opts: { owner?: boolean; scheduledAt?: Date; status?: "PENDING" | "CONFIRMED" } = {}) => {
    const { garage } = await makeGarage(PREFIX)
    const owner = opts.owner === false ? null : await makeOwner(PREFIX)
    const booking = await createBooking({
      garageId: garage.id,
      source: owner ? "MARKETPLACE" : "DIRECT",
      ownerId: owner?.user.id,
      vehicleId: owner?.vehicle.id,
      customerName: "Someone",
      serviceType: "MOT",
      scheduledAt: opts.scheduledAt ?? inDays(2),
      totalPrice: 100,
      status: opts.status,
    })
    return { garage, owner, booking }
  }

  it("walks the lifecycle, stamping completedAt and notifying the customer", async () => {
    const { garage, owner, booking } = await setup()
    const actor = { role: "GARAGE" as const, garageId: garage.id }

    const confirmed = await transitionBooking({ bookingId: booking.id, to: "CONFIRMED", actor })
    expect(confirmed.status).toBe("CONFIRMED")
    const done = await transitionBooking({ bookingId: booking.id, to: "COMPLETED", actor, finalInvoiceValue: 120.5 })
    expect(done.status).toBe("COMPLETED")
    expect(done.completedAt).not.toBeNull()
    expect(done.finalInvoiceValue).toBe(120.5)

    const notes = await prisma.notification.findMany({ where: { userId: owner!.user.id } })
    expect(notes.map((n) => n.title)).toEqual(expect.arrayContaining(["Booking confirmed", "Booking completed"]))
  })

  it("does not notify (or crash) when the customer has no account", async () => {
    const { garage, booking } = await setup({ owner: false })
    const updated = await transitionBooking({ bookingId: booking.id, to: "CONFIRMED", actor: { role: "GARAGE", garageId: garage.id } })
    expect(updated.status).toBe("CONFIRMED")
  })

  it("rejects illegal transitions and other garages", async () => {
    const { garage, booking } = await setup()
    const { garage: other } = await makeGarage(PREFIX, { key: "other" })
    const actor = { role: "GARAGE" as const, garageId: garage.id }

    await expectCode(transitionBooking({ bookingId: booking.id, to: "COMPLETED", actor }), "INVALID_TRANSITION") // PENDING → COMPLETED
    await expectCode(transitionBooking({ bookingId: booking.id, to: "CONFIRMED", actor: { role: "GARAGE", garageId: other.id } }), "FORBIDDEN")
    await expectCode(transitionBooking({ bookingId: "nope", to: "CONFIRMED", actor }), "NOT_FOUND")

    await transitionBooking({ bookingId: booking.id, to: "CONFIRMED", actor })
    await transitionBooking({ bookingId: booking.id, to: "COMPLETED", actor })
    await expectCode(transitionBooking({ bookingId: booking.id, to: "CANCELLED", actor }), "INVALID_TRANSITION") // terminal
  })

  it("only allows NO_SHOW once the start time has passed", async () => {
    const future = await setup({ status: "CONFIRMED" })
    await expectCode(
      transitionBooking({ bookingId: future.booking.id, to: "NO_SHOW", actor: { role: "GARAGE", garageId: future.garage.id } }),
      "TOO_EARLY"
    )

    const past = await setup({ status: "CONFIRMED", scheduledAt: inDays(-2) })
    const ns = await transitionBooking({ bookingId: past.booking.id, to: "NO_SHOW", actor: { role: "GARAGE", garageId: past.garage.id } })
    expect(ns.status).toBe("NO_SHOW")
  })

  it("stores a cancel reason, and clears it when reinstated", async () => {
    const { garage, booking } = await setup()
    const actor = { role: "GARAGE" as const, garageId: garage.id }
    const cancelled = await transitionBooking({ bookingId: booking.id, to: "CANCELLED", actor, cancelReason: "Customer called" })
    expect(cancelled.cancelReason).toBe("Customer called")
    const back = await transitionBooking({ bookingId: booking.id, to: "PENDING", actor })
    expect(back.status).toBe("PENDING")
    expect(back.cancelReason).toBeNull()
  })

  it("confirming acknowledges a placeholder time", async () => {
    const { garage, owner } = await setup()
    const placeholder = await createBooking({
      garageId: garage.id, source: "QUOTE", ownerId: owner!.user.id, vehicleId: owner!.vehicle.id,
      serviceType: "MOT", scheduledAt: inDays(3), totalPrice: 1, timeConfirmed: false,
    })
    expect(placeholder.timeConfirmed).toBe(false)
    const confirmed = await transitionBooking({ bookingId: placeholder.id, to: "CONFIRMED", actor: { role: "GARAGE", garageId: garage.id } })
    expect(confirmed.timeConfirmed).toBe(true)
  })

  it("lets the owner cancel their own pending booking (and notifies the garage) but nothing else", async () => {
    const { garage, owner, booking } = await setup()
    await expectCode(transitionBooking({ bookingId: booking.id, to: "CONFIRMED", actor: { role: "OWNER", userId: owner!.user.id } }), "INVALID_TRANSITION")
    const stranger = await makeOwner(PREFIX, "stranger")
    await expectCode(transitionBooking({ bookingId: booking.id, to: "CANCELLED", actor: { role: "OWNER", userId: stranger.user.id } }), "FORBIDDEN")

    const cancelled = await transitionBooking({ bookingId: booking.id, to: "CANCELLED", actor: { role: "OWNER", userId: owner!.user.id } })
    expect(cancelled.status).toBe("CANCELLED")
    const n = await prisma.notification.findFirst({ where: { garageId: garage.id, type: "BOOKING_STATUS_CHANGED" } })
    expect(n?.link).toBe(`/garage-dashboard/bookings?booking=${booking.id}`)
  })
})

describe("findOverlaps / rescheduleBooking", () => {
  const book = (garageId: string, hour: number, extra: object = {}) =>
    createBooking({
      garageId, source: "DIRECT", serviceType: "MOT", scheduledAt: inDays(5, hour), durationMins: 60, totalPrice: 10,
      status: "CONFIRMED", ...extra,
    })

  it("reports a clash when the single bay is taken, and none for adjacent slots", async () => {
    const { garage } = await makeGarage(PREFIX)
    await book(garage.id, 10)
    const clash = await findOverlaps({ garageId: garage.id, start: inDays(5, 10), durationMins: 60 })
    expect(clash.available).toBe(false)
    expect(clash.reason).toBe("FULL")
    expect(clash.conflicts).toHaveLength(1)

    expect((await findOverlaps({ garageId: garage.id, start: inDays(5, 11), durationMins: 60 })).available).toBe(true)
    expect((await findOverlaps({ garageId: garage.id, start: inDays(5, 9), durationMins: 60 })).available).toBe(true)
  })

  it("adds capacity per active technician", async () => {
    const { garage } = await makeGarage(PREFIX)
    await prisma.technician.createMany({ data: [{ garageId: garage.id, name: "A" }, { garageId: garage.id, name: "B" }] })
    await book(garage.id, 10)
    expect((await findOverlaps({ garageId: garage.id, start: inDays(5, 10), durationMins: 60 })).available).toBe(true)
    await book(garage.id, 10)
    expect((await findOverlaps({ garageId: garage.id, start: inDays(5, 10), durationMins: 60 })).available).toBe(false)
  })

  it("ignores cancelled bookings and the booking being moved", async () => {
    const { garage } = await makeGarage(PREFIX)
    const b = await book(garage.id, 10)
    expect((await findOverlaps({ garageId: garage.id, start: inDays(5, 10), excludeBookingId: b.id })).available).toBe(true)
    await prisma.booking.update({ where: { id: b.id }, data: { status: "CANCELLED" } })
    expect((await findOverlaps({ garageId: garage.id, start: inDays(5, 10) })).available).toBe(true)
  })

  it("treats a garage-wide diary block as closed, and a technician's own bookings as busy", async () => {
    const { garage } = await makeGarage(PREFIX)
    const tech = await prisma.technician.create({ data: { garageId: garage.id, name: "A" } })
    await prisma.technician.create({ data: { garageId: garage.id, name: "B" } })
    await prisma.diaryBlock.create({ data: { garageId: garage.id, startAt: inDays(6, 9), endAt: inDays(6, 12), reason: "Closed" } })
    const blocked = await findOverlaps({ garageId: garage.id, start: inDays(6, 10) })
    expect(blocked.reason).toBe("BLOCKED")

    await book(garage.id, 10, { technicianId: tech.id })
    const busy = await findOverlaps({ garageId: garage.id, start: inDays(5, 10), technicianId: tech.id })
    expect(busy.reason).toBe("TECHNICIAN_BUSY")
  })

  it("reschedules, rejecting clashes unless allowed, and refusing the past or inactive bookings", async () => {
    const { garage } = await makeGarage(PREFIX)
    const a = await book(garage.id, 10)
    await book(garage.id, 14)

    await expectCode(rescheduleBooking({ bookingId: a.id, garageId: garage.id, scheduledAt: inDays(5, 14) }), "OVERLAP")
    const forced = await rescheduleBooking({ bookingId: a.id, garageId: garage.id, scheduledAt: inDays(5, 14), allowOverlap: true })
    expect(forced.scheduledAt.toISOString()).toBe(inDays(5, 14).toISOString())

    const moved = await rescheduleBooking({ bookingId: a.id, garageId: garage.id, scheduledAt: inDays(5, 16) })
    expect(moved.timeConfirmed).toBe(true)

    await expectCode(rescheduleBooking({ bookingId: a.id, garageId: garage.id, scheduledAt: inDays(-1) }), "PAST_TIME")
    await prisma.booking.update({ where: { id: a.id }, data: { status: "COMPLETED" } })
    await expectCode(rescheduleBooking({ bookingId: a.id, garageId: garage.id, scheduledAt: inDays(7) }), "NOT_ACTIVE")
  })

  it("won't reschedule another garage's booking", async () => {
    const { garage } = await makeGarage(PREFIX, { key: "g1" })
    const { garage: other } = await makeGarage(PREFIX, { key: "g2" })
    const b = await book(garage.id, 10)
    await expectCode(rescheduleBooking({ bookingId: b.id, garageId: other.id, scheduledAt: inDays(6) }), "NOT_FOUND")
  })

  it("createBooking(checkAvailability) refuses a taken slot, and lets only one of two concurrent creations win", async () => {
    const { garage } = await makeGarage(PREFIX)
    const input = { garageId: garage.id, source: "DIRECT" as const, serviceType: "MOT", scheduledAt: inDays(5, 15), durationMins: 60, totalPrice: 10, status: "CONFIRMED" as const, checkAvailability: true }

    const results = await Promise.allSettled([createBooking(input), createBooking(input), createBooking(input)])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    for (const r of results.filter((x) => x.status === "rejected")) {
      expect(((r as PromiseRejectedResult).reason as BookingError).code).toBe("OVERLAP")
    }
    expect(await prisma.booking.count({ where: { garageId: garage.id } })).toBe(1)

    // Without the flag (the garage overriding a clash on purpose) it goes through.
    await createBooking({ ...input, checkAvailability: false })
    expect(await prisma.booking.count({ where: { garageId: garage.id } })).toBe(2)
  })

  it("bookings with only a placeholder time don't hold a slot", async () => {
    const { garage } = await makeGarage(PREFIX)
    await book(garage.id, 10, { timeConfirmed: false })
    expect((await findOverlaps({ garageId: garage.id, start: inDays(5, 10), durationMins: 60 })).available).toBe(true)
    await book(garage.id, 10) // a real appointment does
    expect((await findOverlaps({ garageId: garage.id, start: inDays(5, 10), durationMins: 60 })).available).toBe(false)
  })

  it("reinstating a cancelled booking re-checks its slot (override available)", async () => {
    const { garage } = await makeGarage(PREFIX)
    const actor = { role: "GARAGE" as const, garageId: garage.id }
    const cancelled = await book(garage.id, 10)
    await transitionBooking({ bookingId: cancelled.id, to: "CANCELLED", actor })
    await book(garage.id, 10) // someone else takes the freed slot

    await expectCode(transitionBooking({ bookingId: cancelled.id, to: "PENDING", actor }), "OVERLAP")
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: cancelled.id } })).status).toBe("CANCELLED")

    const back = await transitionBooking({ bookingId: cancelled.id, to: "PENDING", actor, allowOverlap: true })
    expect(back.status).toBe("PENDING")
  })

  it("reinstating into a free slot needs no override", async () => {
    const { garage } = await makeGarage(PREFIX)
    const actor = { role: "GARAGE" as const, garageId: garage.id }
    const b = await book(garage.id, 11)
    await transitionBooking({ bookingId: b.id, to: "CANCELLED", actor })
    expect((await transitionBooking({ bookingId: b.id, to: "PENDING", actor })).status).toBe("PENDING")
  })

  it("two simultaneous reschedules into the same slot can't both succeed", async () => {
    const { garage } = await makeGarage(PREFIX)
    const a = await book(garage.id, 9)
    const b = await book(garage.id, 10)
    const results = await Promise.allSettled([
      rescheduleBooking({ bookingId: a.id, garageId: garage.id, scheduledAt: inDays(5, 14) }),
      rescheduleBooking({ bookingId: b.id, garageId: garage.id, scheduledAt: inDays(5, 14) }),
    ])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(await prisma.booking.count({ where: { garageId: garage.id, scheduledAt: inDays(5, 14) } })).toBe(1)
  })

  it("notifies the customer on a time change", async () => {
    const { garage } = await makeGarage(PREFIX)
    const { user, vehicle } = await makeOwner(PREFIX)
    const b = await createBooking({
      garageId: garage.id, source: "MARKETPLACE", ownerId: user.id, vehicleId: vehicle.id,
      serviceType: "MOT", scheduledAt: inDays(5, 10), totalPrice: 10,
    })
    await rescheduleBooking({ bookingId: b.id, garageId: garage.id, scheduledAt: inDays(6, 10) })
    expect(await prisma.notification.count({ where: { userId: user.id, title: "Booking rescheduled" } })).toBe(1)
  })
})

describe("acceptJobResponse", () => {
  const makeJob = async (garageId: string, preferredDate?: Date) => {
    const job = await prisma.jobRequest.create({
      data: {
        token: `${PREFIX}tok-${Math.random().toString(36).slice(2)}`,
        guestName: "Guest Person", guestEmail: `${PREFIX}guest-${Math.random().toString(36).slice(2)}@example.com`,
        guestPhone: "07700900999", registration: "GU12EST", make: "Audi", model: "A3", year: 2017,
        serviceType: "MOT", description: "Needs an MOT test please", city: "Testville", postcode: "ZZ9 1AB",
        preferredDate,
      },
    })
    const response = await prisma.jobResponse.create({ data: { jobRequestId: job.id, garageId, price: 65 } })
    return { job, response }
  }

  it("books atomically: passwordless account + vehicle, statuses, JOB_REQUEST source, placeholder time unconfirmed", async () => {
    const { garage } = await makeGarage(PREFIX, { key: "winner" })
    const { garage: loser } = await makeGarage(PREFIX, { key: "loser" })
    const { job, response } = await makeJob(garage.id)
    const losing = await prisma.jobResponse.create({ data: { jobRequestId: job.id, garageId: loser.id, price: 90 } })

    const r = await acceptJobResponse({ jobRequestId: job.id, jobResponseId: response.id })

    expect(r.booking.source).toBe("JOB_REQUEST")
    expect(r.booking.jobResponseId).toBe(response.id)
    expect(r.booking.totalPrice).toBe(65)
    expect(r.booking.timeConfirmed).toBe(false)
    expect(r.booking.customerName).toBe("Guest Person")
    expect(r.booking.vrm).toBe("GU12EST")
    expect(r.booking.ownerId).toBeTruthy()

    expect((await prisma.jobResponse.findUniqueOrThrow({ where: { id: response.id } })).status).toBe("ACCEPTED")
    expect((await prisma.jobResponse.findUniqueOrThrow({ where: { id: losing.id } })).status).toBe("DECLINED")
    expect((await prisma.jobRequest.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("BOOKED")
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).totalBookings).toBe(1)
  })

  it("uses the guest's preferred date as a confirmed time", async () => {
    const { garage } = await makeGarage(PREFIX)
    const preferred = inDays(9, 11)
    const { job, response } = await makeJob(garage.id, preferred)
    const r = await acceptJobResponse({ jobRequestId: job.id, jobResponseId: response.id })
    expect(r.booking.scheduledAt.toISOString()).toBe(preferred.toISOString())
    expect(r.booking.timeConfirmed).toBe(true)
  })

  it("can't be accepted twice, and rejects a response from a different job", async () => {
    const { garage } = await makeGarage(PREFIX)
    const first = await makeJob(garage.id)
    const second = await makeJob(garage.id)

    await expectCode(acceptJobResponse({ jobRequestId: first.job.id, jobResponseId: second.response.id }), "NOT_FOUND")
    await acceptJobResponse({ jobRequestId: first.job.id, jobResponseId: first.response.id })
    await expectCode(acceptJobResponse({ jobRequestId: first.job.id, jobResponseId: first.response.id }), "CONFLICT")
  })

  it("rolls everything back if the booking can't be created", async () => {
    const { garage } = await makeGarage(PREFIX, { status: "SUSPENDED" })
    const { job, response } = await makeJob(garage.id)
    await expectCode(acceptJobResponse({ jobRequestId: job.id, jobResponseId: response.id }), "GARAGE_NOT_APPROVED")
    expect((await prisma.jobRequest.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("OPEN")
    expect((await prisma.jobResponse.findUniqueOrThrow({ where: { id: response.id } })).status).toBe("SENT")
  })
})
