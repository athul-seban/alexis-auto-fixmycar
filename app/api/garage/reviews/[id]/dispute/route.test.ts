import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { POST } from "./route"
import { PATCH as decide } from "../../../../admin/reviews/route"
import { createBooking } from "@/lib/portal/booking-service"
import { cleanupPrefix, makeGarage, makeOwner } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "disputetest-"
const asGarage = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE" } } as any)
const asAdmin = () => mockSession.mockResolvedValue({ user: { id: "admin", role: "ADMIN", email: "admin@example.com" } } as any)
const dispute = (id: string, body: unknown) =>
  POST(new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })
const adminDecide = (reviewId: string, decision: string, note?: string) =>
  decide(new Request("http://x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewId, decision, note }) }))

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

async function reviewFor(garageId: string) {
  const { user, vehicle } = await makeOwner(PREFIX)
  const booking = await createBooking({ garageId, source: "MARKETPLACE", ownerId: user.id, vehicleId: vehicle.id, serviceType: "MOT", scheduledAt: new Date(), totalPrice: 40, notify: false })
  return prisma.review.create({ data: { ownerId: user.id, garageId, bookingId: booking.id, rating: 1, comment: "Never went here, fake review" } })
}

describe("POST /api/garage/reviews/[id]/dispute", () => {
  it("opens a dispute on the garage's own review, once", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const review = await reviewFor(garage.id)
    asGarage(user.id)

    expect((await dispute(review.id, { reason: "This customer never visited us." })).status).toBe(201)
    expect(await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).toMatchObject({ disputeStatus: "OPEN", disputeReason: "This customer never visited us." })
    expect((await dispute(review.id, { reason: "Trying again with more words" })).status).toBe(409)
  })

  it("validates the reason and won't touch another garage's review", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const { garage: other } = await makeGarage(PREFIX, { key: "other" })
    const mine = await reviewFor(garage.id)
    const theirs = await reviewFor(other.id)
    asGarage(user.id)

    expect((await dispute(mine.id, { reason: "too short" })).status).toBe(400)
    expect((await dispute(theirs.id, { reason: "This is not even my review" })).status).toBe(404)
    expect((await prisma.review.findUniqueOrThrow({ where: { id: theirs.id } })).disputeStatus).toBeNull()
  })
})

describe("PATCH /api/admin/reviews (decide a dispute)", () => {
  const open = async () => {
    const { user, garage } = await makeGarage(PREFIX)
    await prisma.garage.update({ where: { id: garage.id }, data: { averageRating: 1, totalReviews: 1 } })
    const review = await reviewFor(garage.id)
    asGarage(user.id)
    await dispute(review.id, { reason: "This customer never visited us." })
    asAdmin()
    return { garage, review }
  }

  it("upholding removes the review, fixes the garage's rating and tells the garage", async () => {
    const { garage, review } = await open()
    expect((await adminDecide(review.id, "UPHOLD")).status).toBe(200)
    expect(await prisma.review.findUnique({ where: { id: review.id } })).toBeNull()
    expect(await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).toMatchObject({ totalReviews: 0, averageRating: 0 })
    expect(await prisma.notification.count({ where: { garageId: garage.id, title: "Your review dispute was upheld" } })).toBe(1)
    expect(await prisma.auditLog.count({ where: { targetId: review.id, action: "REVIEW_DISPUTE_UPHELD" } })).toBe(1)
  })

  it("rejecting keeps the review and records the moderator's note", async () => {
    const { garage, review } = await open()
    expect((await adminDecide(review.id, "REJECT", "The booking record shows they attended.")).status).toBe(200)
    expect(await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).toMatchObject({ disputeStatus: "REJECTED", disputeNote: "The booking record shows they attended." })
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).totalReviews).toBe(1)
    // A decided dispute can't be decided again.
    expect((await adminDecide(review.id, "UPHOLD")).status).toBe(409)
  })

  it("is admin-only", async () => {
    const { user } = await makeGarage(PREFIX, { key: "nonadmin" })
    const { review } = await open()
    asGarage(user.id)
    expect((await adminDecide(review.id, "UPHOLD")).status).toBe(401)
  })
})
