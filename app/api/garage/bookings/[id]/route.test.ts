import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET, PATCH } from "./route"
import { cleanupPrefix, makeGarage, makeOwner, makeWalkInBooking } from "@/test/fixtures"
import { createBooking } from "@/lib/portal/booking-service"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "gbookidtest-"
const DAY = 86400000
const inDays = (n: number, hour = 10) => {
  const d = new Date(Date.now() + n * DAY)
  d.setUTCHours(hour, 0, 0, 0)
  return d
}
const asUser = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE" } } as any)
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const get = (id: string) => GET(new Request(`http://localhost/api/garage/bookings/${id}`), ctx(id))
const patch = (id: string, body: unknown) =>
  PATCH(new Request(`http://localhost/api/garage/bookings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), ctx(id))

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

const setup = async (extra: object = {}) => {
  const g = await makeGarage(PREFIX)
  const booking = await makeWalkInBooking(g.garage.id, { status: "CONFIRMED", scheduledAt: inDays(3), durationMins: 60, ...extra })
  asUser(g.user.id)
  return { ...g, booking }
}

describe("GET /api/garage/bookings/[id]", () => {
  it("returns the detail including notes, review and reply", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const { user: owner, vehicle } = await makeOwner(PREFIX)
    const b = await createBooking({ garageId: garage.id, source: "MARKETPLACE", ownerId: owner.id, vehicleId: vehicle.id, serviceType: "MOT", scheduledAt: inDays(-2), totalPrice: 50, description: "Annual MOT", notes: "Bring locking wheel nut" })
    await prisma.booking.update({ where: { id: b.id }, data: { status: "COMPLETED" } })
    await prisma.review.create({ data: { ownerId: owner.id, garageId: garage.id, bookingId: b.id, rating: 5, comment: "Brilliant service all round", reply: "Thank you!", repliedAt: new Date() } })
    asUser(user.id)

    const { booking } = await (await get(b.id)).json()
    expect(booking).toMatchObject({ id: b.id, description: "Annual MOT", notes: "Bring locking wheel nut", hasOwner: true })
    expect(booking.review).toMatchObject({ rating: 5, reply: "Thank you!" })
  })

  it("404s for another garage's booking and unknown ids", async () => {
    const { booking } = await setup()
    const other = await makeGarage(PREFIX, { key: "other" })
    asUser(other.user.id)
    expect((await get(booking.id)).status).toBe(404)
    expect((await get("nope")).status).toBe(404)
  })
})

describe("PATCH /api/garage/bookings/[id] — status", () => {
  it("confirms then completes, stamping completedAt and saving the final invoice value", async () => {
    const { booking } = await setup({ status: "PENDING" })

    expect((await (await patch(booking.id, { status: "CONFIRMED" })).json()).booking.status).toBe("CONFIRMED")
    const res = await patch(booking.id, { status: "COMPLETED", finalInvoiceValue: 132.5 })
    const body = (await res.json()).booking

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ status: "COMPLETED", finalInvoiceValue: 132.5 })
    expect(body.completedAt).not.toBeNull()
  })

  it("rejects invalid transitions with 409 INVALID_TRANSITION", async () => {
    const { booking } = await setup({ status: "PENDING" })
    const res = await patch(booking.id, { status: "COMPLETED" })
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe("INVALID_TRANSITION")
  })

  it("rejects NO_SHOW before the start time (422) and allows it afterwards", async () => {
    const future = await setup()
    const early = await patch(future.booking.id, { status: "NO_SHOW" })
    expect(early.status).toBe(422)
    expect((await early.json()).code).toBe("TOO_EARLY")

    const past = await setup({ scheduledAt: inDays(-1) })
    expect((await (await patch(past.booking.id, { status: "NO_SHOW" })).json()).booking.status).toBe("NO_SHOW")
  })

  it("records a cancel reason and lets the booking be reinstated", async () => {
    const { booking } = await setup()
    const cancelled = (await (await patch(booking.id, { status: "CANCELLED", cancelReason: "Customer called" })).json()).booking
    expect(cancelled).toMatchObject({ status: "CANCELLED", cancelReason: "Customer called" })

    const back = (await (await patch(booking.id, { status: "PENDING" })).json()).booking
    expect(back).toMatchObject({ status: "PENDING", cancelReason: null })
  })

  it("doesn't crash or notify when the customer has no account", async () => {
    const { booking, garage } = await setup()
    expect((await patch(booking.id, { status: "COMPLETED" })).status).toBe(200)
    expect(await prisma.notification.count({ where: { garageId: garage.id } })).toBe(0)
  })

  it("notifies an account-holding customer of a status change", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const { user: owner, vehicle } = await makeOwner(PREFIX)
    const b = await createBooking({ garageId: garage.id, source: "MARKETPLACE", ownerId: owner.id, vehicleId: vehicle.id, serviceType: "MOT", scheduledAt: inDays(3), totalPrice: 50 })
    asUser(user.id)
    await patch(b.id, { status: "CONFIRMED" })
    expect(await prisma.notification.count({ where: { userId: owner.id, title: "Booking confirmed" } })).toBe(1)
  })
})

describe("PATCH /api/garage/bookings/[id] — fields", () => {
  it("toggles contacted, edits notes and price", async () => {
    const { booking } = await setup()
    const a = (await (await patch(booking.id, { contacted: true, notes: "Called, will drop off 9am", totalPrice: 70 })).json()).booking
    expect(a.contactedAt).not.toBeNull()
    expect(a).toMatchObject({ notes: "Called, will drop off 9am", totalPrice: 70 })

    const b = (await (await patch(booking.id, { contacted: false, notes: null })).json()).booking
    expect(b.contactedAt).toBeNull()
    expect(b.notes).toBeNull()
  })

  it("keeps the original contactedAt when re-marked contacted", async () => {
    const first = new Date("2026-09-01T10:00:00Z")
    const { booking } = await setup({ contactedAt: first })
    const res = (await (await patch(booking.id, { contacted: true })).json()).booking
    expect(res.contactedAt).toBe(first.toISOString())
  })

  it("assigns and clears a technician, rejecting another garage's technician", async () => {
    const { booking, garage } = await setup()
    const tech = await prisma.technician.create({ data: { garageId: garage.id, name: "Tess", color: "#F97316" } })
    const assigned = (await (await patch(booking.id, { technicianId: tech.id })).json()).booking
    expect(assigned.technician).toMatchObject({ id: tech.id, name: "Tess" })

    expect((await (await patch(booking.id, { technicianId: null })).json()).booking.technician).toBeNull()

    const other = await makeGarage(PREFIX, { key: "other" })
    const alien = await prisma.technician.create({ data: { garageId: other.garage.id, name: "Alien" } })
    expect((await patch(booking.id, { technicianId: alien.id })).status).toBe(400)
  })

  it("rejects an empty body and out-of-range values", async () => {
    const { booking } = await setup()
    expect((await patch(booking.id, {})).status).toBe(400)
    expect((await patch(booking.id, { finalInvoiceValue: -5 })).status).toBe(400)
    expect((await patch(booking.id, { durationMins: 5 })).status).toBe(400)
    expect((await patch(booking.id, { status: "EXPLODED" })).status).toBe(400)
  })
})

describe("PATCH /api/garage/bookings/[id] — rescheduling", () => {
  it("moves the booking and marks the time confirmed", async () => {
    const { booking } = await setup({ timeConfirmed: false })
    const res = await patch(booking.id, { scheduledAt: inDays(6, 14).toISOString() })
    const body = (await res.json()).booking
    expect(res.status).toBe(200)
    expect(body.scheduledAt).toBe(inDays(6, 14).toISOString())
    expect(body.timeConfirmed).toBe(true)
  })

  it("returns 409 OVERLAP for a clash unless allowOverlap is set", async () => {
    const { booking, garage } = await setup()
    await makeWalkInBooking(garage.id, { status: "CONFIRMED", scheduledAt: inDays(6, 14), durationMins: 60 })

    const clash = await patch(booking.id, { scheduledAt: inDays(6, 14).toISOString() })
    expect(clash.status).toBe(409)
    expect((await clash.json()).code).toBe("OVERLAP")

    expect((await patch(booking.id, { scheduledAt: inDays(6, 14).toISOString(), allowOverlap: true })).status).toBe(200)
  })

  it("422s when moved into the past and 409s for a completed booking", async () => {
    const { booking } = await setup()
    const past = await patch(booking.id, { scheduledAt: inDays(-1).toISOString() })
    expect(past.status).toBe(422)
    expect((await past.json()).code).toBe("PAST_TIME")

    const done = await setup({ status: "COMPLETED", scheduledAt: inDays(-2) })
    const res = await patch(done.booking.id, { scheduledAt: inDays(5).toISOString() })
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe("NOT_ACTIVE")
  })

  it("applies nothing when a combined update contains an invalid status change", async () => {
    const { booking } = await setup({ status: "PENDING" })
    const res = await patch(booking.id, { scheduledAt: inDays(8, 11).toISOString(), contacted: true, status: "COMPLETED" })
    expect(res.status).toBe(409)

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })
    expect(after.scheduledAt.toISOString()).toBe(booking.scheduledAt.toISOString())
    expect(after.contactedAt).toBeNull()
  })
})

describe("PATCH /api/garage/bookings/[id] — access", () => {
  it("404s for another garage's booking and doesn't change it", async () => {
    const { booking } = await setup()
    const other = await makeGarage(PREFIX, { key: "other" })
    asUser(other.user.id)

    expect((await patch(booking.id, { status: "CANCELLED" })).status).toBe(404)
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CONFIRMED")
  })

  it("blocks writes for a suspended garage", async () => {
    const { user, garage } = await makeGarage(PREFIX, { status: "SUSPENDED", key: "susp" })
    const booking = await makeWalkInBooking(garage.id)
    asUser(user.id)
    const res = await patch(booking.id, { contacted: true })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe("GARAGE_SUSPENDED")
  })
})
