import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { DELETE } from "./route"
import { createBooking } from "@/lib/portal/booking-service"
import { cleanupPrefix, makeGarage, makeOwner } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "adminrevtest-"
const del = (reviewId: string) => DELETE(new Request("http://x", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewId }) }))

beforeEach(async () => {
  mockSession.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } } as any)
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("DELETE /api/admin/reviews", () => {
  it("removes the review and rolls its rating back out of the garage's public average", async () => {
    const { garage } = await makeGarage(PREFIX)
    // 10 prior reviews averaging 4.0, then this 1-star review lands: (4*10 + 1) / 11.
    await prisma.garage.update({ where: { id: garage.id }, data: { averageRating: 41 / 11, totalReviews: 11 } })
    const { user, vehicle } = await makeOwner(PREFIX)
    const booking = await createBooking({ garageId: garage.id, source: "MARKETPLACE", ownerId: user.id, vehicleId: vehicle.id, serviceType: "MOT", scheduledAt: new Date(), totalPrice: 1, notify: false })
    const review = await prisma.review.create({ data: { ownerId: user.id, garageId: garage.id, bookingId: booking.id, rating: 1, comment: "Terrible, avoid this place" } })

    const res = await del(review.id)
    expect(res.status).toBe(200)
    expect(await prisma.review.findUnique({ where: { id: review.id } })).toBeNull()

    const after = await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })
    expect(after.totalReviews).toBe(10)
    expect(after.averageRating).toBeCloseTo(4, 6)
  })

  it("resets the garage to 0 when its only review is removed", async () => {
    const { garage } = await makeGarage(PREFIX)
    await prisma.garage.update({ where: { id: garage.id }, data: { averageRating: 5, totalReviews: 1 } })
    const { user, vehicle } = await makeOwner(PREFIX)
    const booking = await createBooking({ garageId: garage.id, source: "MARKETPLACE", ownerId: user.id, vehicleId: vehicle.id, serviceType: "MOT", scheduledAt: new Date(), totalPrice: 1, notify: false })
    const review = await prisma.review.create({ data: { ownerId: user.id, garageId: garage.id, bookingId: booking.id, rating: 5, comment: "Excellent all round" } })
    await del(review.id)
    expect(await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).toMatchObject({ totalReviews: 0, averageRating: 0 })
  })

  it("404s for an unknown review and rejects non-admins", async () => {
    expect((await del("nope")).status).toBe(404)
    mockSession.mockResolvedValue({ user: { id: "x", role: "GARAGE" } } as any)
    expect((await del("anything")).status).toBe(401)
  })
})
