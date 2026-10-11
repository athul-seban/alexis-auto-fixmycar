import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET } from "./route"
import { cleanupPrefix, makeGarage, makeOwner, makeWalkInBooking } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "owneroverview-"

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("GET /api/overview (customer)", () => {
  it("requires a signed-in customer", async () => {
    mockSession.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
    mockSession.mockResolvedValue({ user: { id: "x", role: "GARAGE" } } as any)
    expect((await GET()).status).toBe(403)
  })

  it("counts unread messages without marking them read, and totals spend for the year", async () => {
    const { user } = await makeOwner(PREFIX)
    const { garage, user: garageUser } = await makeGarage(PREFIX)
    mockSession.mockResolvedValue({ user: { id: user.id, role: "OWNER" } } as any)

    const vehicle = await prisma.vehicle.create({ data: { ownerId: user.id, registration: "OV12 ABC", make: "Ford", model: "Focus", year: 2019 } })
    const done = (price: number, fiv?: number) =>
      prisma.booking.create({
        data: { ownerId: user.id, vehicleId: vehicle.id, garageId: garage.id, serviceType: "MOT", status: "COMPLETED", scheduledAt: new Date(), completedAt: new Date(), totalPrice: price, finalInvoiceValue: fiv },
      })
    const b1 = await done(50)
    await done(100, 120.5) // the invoiced value wins over the booked price
    await prisma.message.create({ data: { bookingId: b1.id, senderId: garageUser.id, garageId: garage.id, body: "Ready for collection" } })

    const first = await (await GET()).json()
    expect(first).toMatchObject({ unreadMessages: 1, spentThisYear: 170.5, completedThisYear: 2, totals: { vehicles: 2 /* makeOwner seeds one */, quotes: 0, bookings: 2 } })
    // Reading the overview must not mark the message read.
    expect((await (await GET()).json()).unreadMessages).toBe(1)
  })

  it("ignores walk-in bookings and other customers", async () => {
    const { user } = await makeOwner(PREFIX)
    const { garage } = await makeGarage(PREFIX)
    await makeWalkInBooking(garage.id, { status: "COMPLETED", totalPrice: 999 })
    mockSession.mockResolvedValue({ user: { id: user.id, role: "OWNER" } } as any)
    expect(await (await GET()).json()).toMatchObject({ spentThisYear: 0, completedThisYear: 0, unreadMessages: 0 })
  })
})
