import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { PATCH } from "./route"

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
})
