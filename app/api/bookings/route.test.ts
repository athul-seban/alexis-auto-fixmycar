import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { PATCH, POST } from "./route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)

const PREFIX = "booktest-"

async function makeFixtures() {
  const owner = await prisma.user.create({
    data: { email: `${PREFIX}owner@example.com`, role: "OWNER", name: "Test Owner" },
  })
  const garageUser = await prisma.user.create({
    data: { email: `${PREFIX}garage@example.com`, role: "GARAGE", name: "Test Garage User" },
  })
  const otherGarageUser = await prisma.user.create({
    data: { email: `${PREFIX}other-garage@example.com`, role: "GARAGE", name: "Other Garage User" },
  })
  const garage = await prisma.garage.create({
    data: {
      userId: garageUser.id,
      name: `${PREFIX}Garage`,
      slug: `${PREFIX}${Date.now()}`,
      phone: "0123456789",
      email: "garage@example.com",
      address: "1 Test St",
      city: "Bristol",
      postcode: "BS1 1AA",
      status: "APPROVED",
    },
  })
  const otherGarage = await prisma.garage.create({
    data: {
      userId: otherGarageUser.id,
      name: `${PREFIX}OtherGarage`,
      slug: `${PREFIX}other-${Date.now()}`,
      phone: "0123456789",
      email: "other@example.com",
      address: "2 Test St",
      city: "Bristol",
      postcode: "BS1 1AB",
      status: "APPROVED",
    },
  })
  const vehicle = await prisma.vehicle.create({
    data: { ownerId: owner.id, registration: `${PREFIX}REG`, make: "Ford", model: "Focus", year: 2020 },
  })
  const booking = await prisma.booking.create({
    data: {
      ownerId: owner.id,
      vehicleId: vehicle.id,
      garageId: garage.id,
      serviceType: "MOT",
      status: "PENDING",
      scheduledAt: new Date(),
      totalPrice: 50,
    },
  })
  return { owner, garageUser, otherGarageUser, garage, otherGarage, vehicle, booking }
}

async function cleanup() {
  await prisma.booking.deleteMany({ where: { vehicle: { registration: `${PREFIX}REG` } } })
  await prisma.quote.deleteMany({ where: { vehicle: { registration: `${PREFIX}REG` } } })
  await prisma.vehicle.deleteMany({ where: { registration: `${PREFIX}REG` } })
  await prisma.garage.deleteMany({ where: { name: { startsWith: PREFIX } } })
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
}

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/bookings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("PATCH /api/bookings — status transition guards", () => {
  beforeEach(cleanup)
  afterAll(cleanup)

  it("allows the owning garage to confirm a pending booking", async () => {
    const { garageUser, booking } = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: garageUser.id, role: "GARAGE" } } as any)

    const res = await PATCH(patchRequest({ bookingId: booking.id, status: "CONFIRMED" }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.booking.status).toBe("CONFIRMED")
  })

  it("rejects a garage that doesn't own the booking", async () => {
    const { otherGarageUser, booking } = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: otherGarageUser.id, role: "GARAGE" } } as any)

    const res = await PATCH(patchRequest({ bookingId: booking.id, status: "CONFIRMED" }))
    expect(res.status).toBe(403)
  })

  it("allows the owner to cancel their own booking", async () => {
    const { owner, booking } = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: owner.id, role: "OWNER" } } as any)

    const res = await PATCH(patchRequest({ bookingId: booking.id, status: "CANCELLED" }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.booking.status).toBe("CANCELLED")
  })

  it("rejects an owner attempting a non-cancel status change", async () => {
    const { owner, booking } = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: owner.id, role: "OWNER" } } as any)

    const res = await PATCH(patchRequest({ bookingId: booking.id, status: "COMPLETED" }))
    expect(res.status).toBe(403)
  })

  it("rejects an unrelated owner cancelling someone else's booking", async () => {
    const { booking } = await makeFixtures()
    const stranger = await prisma.user.create({ data: { email: `${PREFIX}stranger@example.com`, role: "OWNER" } })
    mockSession.mockResolvedValue({ user: { id: stranger.id, role: "OWNER" } } as any)

    const res = await PATCH(patchRequest({ bookingId: booking.id, status: "CANCELLED" }))
    expect(res.status).toBe(403)
  })

  it("returns 404 for a non-existent booking", async () => {
    const { garageUser } = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: garageUser.id, role: "GARAGE" } } as any)

    const res = await PATCH(patchRequest({ bookingId: "does-not-exist", status: "CONFIRMED" }))
    expect(res.status).toBe(404)
  })

  it("rejects unauthenticated requests", async () => {
    mockSession.mockResolvedValue(null)
    const res = await PATCH(patchRequest({ bookingId: "anything", status: "CONFIRMED" }))
    expect(res.status).toBe(401)
  })

  it("sets completedAt when transitioning to COMPLETED", async () => {
    const { garageUser, booking } = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: garageUser.id, role: "GARAGE" } } as any)

    await PATCH(patchRequest({ bookingId: booking.id, status: "CONFIRMED" }))
    const res = await PATCH(patchRequest({ bookingId: booking.id, status: "COMPLETED" }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.booking.completedAt).not.toBeNull()
  })

  it("refuses to change a terminal booking (a completed booking can't be cancelled)", async () => {
    const { owner, garageUser, booking } = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: garageUser.id, role: "GARAGE" } } as any)
    await PATCH(patchRequest({ bookingId: booking.id, status: "CONFIRMED" }))
    await PATCH(patchRequest({ bookingId: booking.id, status: "COMPLETED" }))

    mockSession.mockResolvedValue({ user: { id: owner.id, role: "OWNER" } } as any)
    const res = await PATCH(patchRequest({ bookingId: booking.id, status: "CANCELLED" }))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe("INVALID_TRANSITION")
  })

  it("notifies the customer when the garage changes the status", async () => {
    const { owner, garageUser, booking } = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: garageUser.id, role: "GARAGE" } } as any)
    await PATCH(patchRequest({ bookingId: booking.id, status: "CONFIRMED" }))
    const n = await prisma.notification.findFirst({ where: { userId: owner.id } })
    expect(n?.title).toBe("Booking confirmed")
    expect(n?.link).toBe(`/dashboard?booking=${booking.id}`)
  })
})

function postRequest(body: unknown) {
  return new Request("http://localhost/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/bookings — owner creates a booking", () => {
  beforeEach(cleanup)
  afterAll(cleanup)

  const payload = (f: Awaited<ReturnType<typeof makeFixtures>>, extra: object = {}) => ({
    vehicleId: f.vehicle.id,
    garageId: f.garage.id,
    serviceType: "MOT",
    totalPrice: 50,
    scheduledAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    ...extra,
  })

  it("creates a MARKETPLACE booking with a reference, snapshots and a garage notification", async () => {
    const f = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: f.owner.id, role: "OWNER" } } as any)

    const res = await POST(postRequest(payload(f)))
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.booking.source).toBe("MARKETPLACE")
    expect(data.booking.reference).toMatch(/^QMG-/)
    expect(data.booking.timeConfirmed).toBe(true)
    expect(data.booking.vrm).toBe(`${PREFIX}REG`.toUpperCase().replace(/[^A-Z0-9]/g, ""))
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: f.garage.id } })).totalBookings).toBe(1)
    expect(await prisma.notification.count({ where: { garageId: f.garage.id, type: "BOOKING_CREATED" } })).toBe(1)
  })

  it("flags the time as unconfirmed when the customer doesn't choose one", async () => {
    const f = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: f.owner.id, role: "OWNER" } } as any)

    const res = await POST(postRequest(payload(f, { scheduledAt: undefined })))
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.booking.timeConfirmed).toBe(false)
  })

  it("rejects a vehicle that isn't the caller's", async () => {
    const f = await makeFixtures()
    const stranger = await prisma.user.create({ data: { email: `${PREFIX}stranger2@example.com`, role: "OWNER" } })
    mockSession.mockResolvedValue({ user: { id: stranger.id, role: "OWNER" } } as any)

    const res = await POST(postRequest(payload(f)))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe("VEHICLE_NOT_OWNED")
  })

  it("books from a quote (source QUOTE) and marks the quote accepted", async () => {
    const f = await makeFixtures()
    const quote = await prisma.quote.create({
      data: { ownerId: f.owner.id, vehicleId: f.vehicle.id, garageId: f.garage.id, serviceType: "MOT", description: "Needs an MOT test", status: "SENT", price: 50 },
    })
    mockSession.mockResolvedValue({ user: { id: f.owner.id, role: "OWNER" } } as any)

    const res = await POST(postRequest(payload(f, { quoteId: quote.id })))
    expect(res.status).toBe(201)
    expect((await res.json()).booking.source).toBe("QUOTE")
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("ACCEPTED")
  })

  it("won't use a quote that belongs to a different garage", async () => {
    const f = await makeFixtures()
    const quote = await prisma.quote.create({
      data: { ownerId: f.owner.id, vehicleId: f.vehicle.id, garageId: f.otherGarage.id, serviceType: "MOT", description: "Needs an MOT test", status: "SENT", price: 50 },
    })
    mockSession.mockResolvedValue({ user: { id: f.owner.id, role: "OWNER" } } as any)

    const res = await POST(postRequest(payload(f, { quoteId: quote.id })))
    expect(res.status).toBe(409)
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("SENT")
  })

  it("won't book a quote that isn't open (unpriced, declined or expired)", async () => {
    const f = await makeFixtures()
    const quote = await prisma.quote.create({
      data: { ownerId: f.owner.id, vehicleId: f.vehicle.id, garageId: f.garage.id, serviceType: "MOT", description: "Needs an MOT test", status: "EXPIRED", price: 50 },
    })
    mockSession.mockResolvedValue({ user: { id: f.owner.id, role: "OWNER" } } as any)

    const res = await POST(postRequest(payload(f, { quoteId: quote.id })))
    expect(res.status).toBe(409)
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("EXPIRED")
  })

  it("rejects a garage that isn't approved", async () => {
    const f = await makeFixtures()
    await prisma.garage.update({ where: { id: f.garage.id }, data: { status: "SUSPENDED" } })
    mockSession.mockResolvedValue({ user: { id: f.owner.id, role: "OWNER" } } as any)

    const res = await POST(postRequest(payload(f)))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe("GARAGE_NOT_APPROVED")
  })

  it("is owner-only", async () => {
    const f = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: f.garageUser.id, role: "GARAGE" } } as any)
    expect((await POST(postRequest(payload(f)))).status).toBe(403)

    mockSession.mockResolvedValue(null)
    expect((await POST(postRequest(payload(f)))).status).toBe(401)
  })

  it("validates the body", async () => {
    const f = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: f.owner.id, role: "OWNER" } } as any)
    expect((await POST(postRequest(payload(f, { totalPrice: -5 })))).status).toBe(400)
  })
})
