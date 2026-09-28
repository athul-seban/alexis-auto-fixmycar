import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { POST } from "./route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/notifications", () => ({ notifyGarage: vi.fn().mockResolvedValue(undefined) }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "reviewtest-"

async function makeFixtures(bookingStatus: string) {
  const owner = await prisma.user.create({ data: { email: `${PREFIX}owner@example.com`, role: "OWNER" } })
  const garageUser = await prisma.user.create({ data: { email: `${PREFIX}garage@example.com`, role: "GARAGE" } })
  const garage = await prisma.garage.create({
    data: {
      userId: garageUser.id,
      name: `${PREFIX}Garage`,
      slug: `${PREFIX}${Date.now()}`,
      phone: "0123456789",
      email: "g@example.com",
      address: "1 St",
      city: "Bristol",
      postcode: "BS1 1AA",
      status: "APPROVED",
      averageRating: 4,
      totalReviews: 2,
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
      status: bookingStatus,
      scheduledAt: new Date(),
      completedAt: bookingStatus === "COMPLETED" ? new Date() : null,
      totalPrice: 50,
    },
  })
  return { owner, garage, booking }
}

async function cleanup() {
  await prisma.review.deleteMany({ where: { comment: { contains: PREFIX } } })
  await prisma.booking.deleteMany({ where: { vehicle: { registration: `${PREFIX}REG` } } })
  await prisma.vehicle.deleteMany({ where: { registration: `${PREFIX}REG` } })
  await prisma.garage.deleteMany({ where: { name: { startsWith: PREFIX } } })
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/reviews", () => {
  beforeEach(cleanup)
  afterAll(cleanup)

  it("rejects a GARAGE-role user (only owners can review)", async () => {
    const { booking } = await makeFixtures("COMPLETED")
    mockSession.mockResolvedValue({ user: { id: "garage-1", role: "GARAGE" } } as any)

    const res = await POST(postRequest({ bookingId: booking.id, rating: 5, comment: `${PREFIX}great service here` }))
    expect(res.status).toBe(403)
  })

  it("rejects a review for a booking that isn't COMPLETED", async () => {
    const { owner, booking } = await makeFixtures("CONFIRMED")
    mockSession.mockResolvedValue({ user: { id: owner.id, role: "OWNER" } } as any)

    const res = await POST(postRequest({ bookingId: booking.id, rating: 5, comment: `${PREFIX}great service here` }))
    expect(res.status).toBe(409)
  })

  it("rejects a review from an owner who doesn't own the booking", async () => {
    const { booking } = await makeFixtures("COMPLETED")
    const stranger = await prisma.user.create({ data: { email: `${PREFIX}stranger@example.com`, role: "OWNER" } })
    mockSession.mockResolvedValue({ user: { id: stranger.id, role: "OWNER" } } as any)

    const res = await POST(postRequest({ bookingId: booking.id, rating: 5, comment: `${PREFIX}great service here` }))
    expect(res.status).toBe(404)
  })

  it("creates a review and correctly recomputes the garage's average rating", async () => {
    const { owner, garage, booking } = await makeFixtures("COMPLETED")
    mockSession.mockResolvedValue({ user: { id: owner.id, role: "OWNER" } } as any)

    const res = await POST(postRequest({ bookingId: booking.id, rating: 5, comment: `${PREFIX}excellent quick service` }))
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.review.rating).toBe(5)

    // Garage started at averageRating=4, totalReviews=2 -> (4*2 + 5) / 3 = 4.333...
    const updated = await prisma.garage.findUnique({ where: { id: garage.id } })
    expect(updated?.totalReviews).toBe(3)
    expect(updated?.averageRating).toBeCloseTo(4.333, 2)
  })

  it("rejects a second review on the same booking", async () => {
    const { owner, booking } = await makeFixtures("COMPLETED")
    mockSession.mockResolvedValue({ user: { id: owner.id, role: "OWNER" } } as any)

    await POST(postRequest({ bookingId: booking.id, rating: 5, comment: `${PREFIX}first review here` }))
    const res = await POST(postRequest({ bookingId: booking.id, rating: 3, comment: `${PREFIX}second review attempt` }))

    expect(res.status).toBe(409)
  })

  it("rejects an unauthenticated request", async () => {
    mockSession.mockResolvedValue(null)
    const res = await POST(postRequest({ bookingId: "anything", rating: 5, comment: `${PREFIX}whatever` }))
    expect(res.status).toBe(401)
  })

  it("rejects a comment shorter than 10 characters", async () => {
    const { owner, booking } = await makeFixtures("COMPLETED")
    mockSession.mockResolvedValue({ user: { id: owner.id, role: "OWNER" } } as any)

    const res = await POST(postRequest({ bookingId: booking.id, rating: 5, comment: "short" }))
    expect(res.status).toBe(400)
  })
})
