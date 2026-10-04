import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET } from "./route"
import { PATCH } from "./[id]/route"
import { createBooking } from "@/lib/portal/booking-service"
import { cleanupPrefix, makeGarage, makeOwner } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "grevtest-"
const asUser = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE" } } as any)
const get = (qs = "") => GET(new Request(`http://x/api/garage/reviews${qs ? `?${qs}` : ""}`))
const patch = (id: string, body: unknown) =>
  PATCH(new Request("http://x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

let n = 0
const makeReview = async (garageId: string, rating: number, over: object = {}) => {
  const { user, vehicle } = await makeOwner(PREFIX, `rev${n++}`)
  const booking = await createBooking({ garageId, source: "MARKETPLACE", ownerId: user.id, vehicleId: vehicle.id, serviceType: "MOT", scheduledAt: new Date(Date.now() - 86400000), totalPrice: 50, notify: false })
  const review = await prisma.review.create({ data: { ownerId: user.id, garageId, bookingId: booking.id, rating, comment: `A ${rating} star experience overall`, ...over } })
  return { user, booking, review }
}

describe("GET /api/garage/reviews", () => {
  it("lists newest first with customer, service and booking reference, plus the rating breakdown", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    await prisma.garage.update({ where: { id: garage.id }, data: { averageRating: 4.5, totalReviews: 120 } })
    const old = await makeReview(garage.id, 5, { createdAt: new Date("2026-01-01T10:00:00Z") })
    await makeReview(garage.id, 3, { createdAt: new Date("2026-06-01T10:00:00Z"), reply: "Sorry about that", repliedAt: new Date() })
    await makeReview(garage.id, 5, { createdAt: new Date("2026-09-01T10:00:00Z") })
    asUser(user.id)

    const body = await (await get()).json()
    expect(body.total).toBe(3)
    expect(body.reviews.map((r: any) => r.rating)).toEqual([5, 3, 5])
    expect(body.reviews[2]).toMatchObject({ id: old.review.id, serviceType: "MOT", bookingId: old.booking.id, reply: null })
    expect(body.reviews[2].bookingReference).toMatch(/^QMG-/)
    expect(body.reviews[2].customerName).toBeTruthy()
    expect(body.counts).toEqual({ byRating: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 2 }, unreplied: 2 })
    expect(body.summary).toEqual({ average: 4.5, total: 120 }) // the public headline figures, not row counts
  })

  it("filters by rating and by replied/unreplied, and paginates", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    await makeReview(garage.id, 5)
    await makeReview(garage.id, 5, { reply: "Thanks!", repliedAt: new Date() })
    await makeReview(garage.id, 2)
    asUser(user.id)

    expect((await (await get("rating=5")).json()).total).toBe(2)
    expect((await (await get("replied=no")).json()).total).toBe(2)
    expect((await (await get("replied=yes")).json()).total).toBe(1)
    expect((await (await get("rating=5&replied=no")).json()).total).toBe(1)

    const page = await (await get("pageSize=10&page=2")).json()
    expect(page).toMatchObject({ page: 2, total: 3, totalPages: 1, reviews: [] })
  })

  it("only shows the caller's garage and validates input", async () => {
    const mine = await makeGarage(PREFIX, { key: "mine" })
    const other = await makeGarage(PREFIX, { key: "other" })
    await makeReview(other.garage.id, 1)
    asUser(mine.user.id)
    const body = await (await get()).json()
    expect(body.total).toBe(0)
    expect(body.counts.byRating[1]).toBe(0)

    expect((await get("rating=6")).status).toBe(400)
    expect((await get("replied=maybe")).status).toBe(400)
    expect((await get("pageSize=7")).status).toBe(400)
  })
})

describe("PATCH /api/garage/reviews/[id]", () => {
  it("publishes a reply, notifies the customer once, and lets the garage edit or remove it", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const { user: owner, review } = await makeReview(garage.id, 4)
    asUser(user.id)

    const res = await patch(review.id, { reply: "  Thanks for coming in!  " })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.review).toMatchObject({ id: review.id, reply: "Thanks for coming in!" })
    expect(body.review.repliedAt).toBeTruthy()
    expect(await prisma.notification.count({ where: { userId: owner.id, type: "REVIEW_REPLY" } })).toBe(1)

    // Editing replaces the reply but doesn't notify again.
    await patch(review.id, { reply: "Thanks — see you next year!" })
    expect((await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).reply).toBe("Thanks — see you next year!")
    expect(await prisma.notification.count({ where: { userId: owner.id, type: "REVIEW_REPLY" } })).toBe(1)

    const cleared = await patch(review.id, { reply: null })
    expect((await cleared.json()).review).toEqual({ id: review.id, reply: null, repliedAt: null })
  })

  it("validates the reply", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const { review } = await makeReview(garage.id, 5)
    asUser(user.id)
    expect((await patch(review.id, { reply: "" })).status).toBe(400)
    expect((await patch(review.id, { reply: "   " })).status).toBe(400)
    expect((await patch(review.id, { reply: "x".repeat(1001) })).status).toBe(400)
    expect((await patch(review.id, {})).status).toBe(400)
  })

  it("can't reply to another garage's review, and is blocked for suspended garages", async () => {
    const mine = await makeGarage(PREFIX, { key: "mine" })
    const other = await makeGarage(PREFIX, { key: "other" })
    const { review: theirs } = await makeReview(other.garage.id, 5)
    asUser(mine.user.id)
    expect((await patch(theirs.id, { reply: "Hijack" })).status).toBe(404)
    expect((await prisma.review.findUniqueOrThrow({ where: { id: theirs.id } })).reply).toBeNull()

    // Reviews exist from when the garage was live; suspension only freezes further changes.
    const s = await makeGarage(PREFIX, { key: "s" })
    const { review } = await makeReview(s.garage.id, 5)
    await prisma.garage.update({ where: { id: s.garage.id }, data: { status: "SUSPENDED" } })
    asUser(s.user.id)
    expect((await get()).status).toBe(200)
    expect((await patch(review.id, { reply: "Hi" })).status).toBe(403)
  })
})
