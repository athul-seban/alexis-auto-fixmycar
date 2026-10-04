import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET, PATCH } from "./route"
import { createBooking } from "@/lib/portal/booking-service"
import { DEFAULT_OPENING_HOURS } from "@/lib/portal/opening-hours"
import { cleanupPrefix, makeGarage, makeOwner } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "garagepatchtest-"
const asUser = (id: string, role = "GARAGE") => mockSession.mockResolvedValue({ user: { id, role } } as any)
const patch = (id: string, body: unknown) =>
  PATCH(new Request("http://x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("PATCH /api/garages/[id]", () => {
  it("updates profile fields, uppercases the postcode, and returns the mapped profile", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    asUser(user.id)

    const res = await patch(garage.id, { name: "New Name Motors", postcode: "bs1 4dj", isMobile: true, services: ["MOT", "BRAKES"], website: "https://example.com", description: "We fix cars." })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.garage).toMatchObject({ name: "New Name Motors", postcode: "BS1 4DJ", isMobile: true, services: ["MOT", "BRAKES"], website: "https://example.com", slug: garage.slug })
    expect(Array.isArray(body.garage.verificationBadges)).toBe(true)
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).services).toBe(JSON.stringify(["MOT", "BRAKES"]))
  })

  it("is a partial update: omitted fields are untouched", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    asUser(user.id)
    await patch(garage.id, { phone: "01234 567890" })
    const after = await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })
    expect(after.phone).toBe("01234 567890")
    expect(after.name).toBe(garage.name)
    expect(after.city).toBe(garage.city)
  })

  it("saves valid opening hours and rejects invalid ones", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    asUser(user.id)

    const hours = { ...DEFAULT_OPENING_HOURS, saturday: { open: false, from: "", to: "" } }
    expect((await patch(garage.id, { openingHours: hours })).status).toBe(200)
    expect(JSON.parse((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).openingHours!)).toEqual(hours)

    expect((await patch(garage.id, { openingHours: { ...hours, monday: { open: true, from: "18:00", to: "09:00" } } })).status).toBe(400)
    expect((await patch(garage.id, { openingHours: { monday: hours.monday } })).status).toBe(400)
  })

  it("validates fields (and writes nothing when any is invalid)", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    asUser(user.id)
    expect((await patch(garage.id, { email: "not-an-email" })).status).toBe(400)
    // Non-http(s) schemes would become clickable links on the public profile (stored XSS).
    expect((await patch(garage.id, { website: "javascript:alert(1)" })).status).toBe(400)
    expect((await patch(garage.id, { website: "data:text/html,<script>1</script>" })).status).toBe(400)
    expect((await patch(garage.id, { logo: "javascript:alert(1)" })).status).toBe(400)
    expect((await patch(garage.id, { services: ["TELEPORTING"] })).status).toBe(400)
    expect((await patch(garage.id, { name: "A" })).status).toBe(400)
    expect((await patch(garage.id, { name: "Fine Name", phone: "1" })).status).toBe(400)
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).name).toBe(garage.name)
  })

  it("clears the website with an empty string", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    asUser(user.id)
    await patch(garage.id, { website: "https://example.com" })
    await patch(garage.id, { website: "" })
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).website).toBeNull()
  })

  it("ignores attempts to change protected fields", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    asUser(user.id)
    await patch(garage.id, { status: "APPROVED", slug: "hijacked", isVerified: true, totalBookings: 9999 })
    const after = await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })
    expect(after.slug).toBe(garage.slug)
    expect(after.isVerified).toBe(false)
    expect(after.totalBookings).toBe(0)
  })

  it("only lets a garage edit its own profile, and only garage users", async () => {
    const mine = await makeGarage(PREFIX, { key: "mine" })
    const other = await makeGarage(PREFIX, { key: "other" })
    asUser(mine.user.id)
    expect((await patch(other.garage.id, { name: "Hijacked" })).status).toBe(403)

    const { user: owner } = await makeOwner(PREFIX)
    asUser(owner.id, "OWNER")
    expect((await patch(mine.garage.id, { name: "Owner edit" })).status).toBe(403)

    mockSession.mockResolvedValue(null)
    expect((await patch(mine.garage.id, { name: "Anon edit" })).status).toBe(401)
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: other.garage.id } })).name).toBe(other.garage.name)
  })

  it("is read-only for a suspended garage", async () => {
    const { user, garage } = await makeGarage(PREFIX, { status: "SUSPENDED" })
    asUser(user.id)
    const res = await patch(garage.id, { name: "Sneaky Rename" })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe("GARAGE_SUSPENDED")
  })
})

describe("GET /api/garages/[id] (public)", () => {
  const getPublic = (id: string) => GET(new Request("http://x"), { params: Promise.resolve({ id }) })

  it("publishes garage replies on reviews", async () => {
    const { garage } = await makeGarage(PREFIX)
    const { user, vehicle } = await makeOwner(PREFIX)
    const booking = await createBooking({ garageId: garage.id, source: "MARKETPLACE", ownerId: user.id, vehicleId: vehicle.id, serviceType: "MOT", scheduledAt: new Date(), totalPrice: 1, notify: false })
    await prisma.review.create({ data: { ownerId: user.id, garageId: garage.id, bookingId: booking.id, rating: 5, comment: "Great service from start to finish", reply: "Thank you, see you next year!", repliedAt: new Date() } })

    const { garage: g } = await (await getPublic(garage.slug)).json()
    expect(g.reviews[0]).toMatchObject({ reply: "Thank you, see you next year!" })
    expect(g.reviews[0].repliedAt).toBeTruthy()
  })

  it("lists only active, offered services that actually have a price", async () => {
    const { garage } = await makeGarage(PREFIX, { services: ["MOT", "BRAKES", "TYRES"] })
    await prisma.servicePrice.createMany({ data: [
      { garageId: garage.id, serviceType: "MOT", priceFrom: 40, priceTo: 55, durationMins: 60 },
      { garageId: garage.id, serviceType: "BRAKES", priceFrom: 100, durationMins: 120, isActive: false }, // switched off
      { garageId: garage.id, serviceType: "TYRES", durationMins: 60 }, // no price set
      { garageId: garage.id, serviceType: "CLUTCH", priceFrom: 300, durationMins: 240 }, // not offered
    ] })

    const { garage: g } = await (await getPublic(garage.id)).json()
    expect(g.prices).toEqual([{ serviceType: "MOT", priceFrom: 40, priceTo: 55, durationMins: 60, notes: null }])
  })

  it("404s for garages that aren't approved", async () => {
    const { garage } = await makeGarage(PREFIX, { status: "PENDING" })
    expect((await getPublic(garage.id)).status).toBe(404)
  })
})