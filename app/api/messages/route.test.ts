import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { POST } from "./route"
import { cleanupPrefix, makeGarage, makeOwner, makeWalkInBooking } from "@/test/fixtures"
import { createBooking } from "@/lib/portal/booking-service"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "msgtest-"

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))

describe("POST /api/messages with walk-in bookings", () => {
  it("tells the garage a walk-in customer has no account instead of failing", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const booking = await makeWalkInBooking(garage.id)
    mockSession.mockResolvedValue({ user: { id: user.id, role: "GARAGE" } } as any)

    const res = await post({ bookingId: booking.id, body: "Hello, your car is ready" })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/doesn't have an account/)
    expect(await prisma.message.count({ where: { garageId: garage.id } })).toBe(0)
  })

  it("still delivers garage → owner messages for account-holding customers, with the new deep link on the way back", async () => {
    const { user: garageUser, garage } = await makeGarage(PREFIX)
    const { user: owner, vehicle } = await makeOwner(PREFIX)
    const booking = await createBooking({
      garageId: garage.id, source: "MARKETPLACE", ownerId: owner.id, vehicleId: vehicle.id,
      serviceType: "MOT", scheduledAt: new Date(Date.now() + 86400000), totalPrice: 50,
    })

    mockSession.mockResolvedValue({ user: { id: garageUser.id, role: "GARAGE" } } as any)
    expect((await post({ bookingId: booking.id, body: "See you tomorrow" })).status).toBe(201)
    expect(await prisma.notification.count({ where: { userId: owner.id, type: "MESSAGE_RECEIVED" } })).toBe(1)

    mockSession.mockResolvedValue({ user: { id: owner.id, role: "OWNER" } } as any)
    expect((await post({ bookingId: booking.id, body: "Great, thanks" })).status).toBe(201)
    const n = await prisma.notification.findFirstOrThrow({ where: { garageId: garage.id, type: "MESSAGE_RECEIVED" } })
    expect(n.link).toBe(`/garage-dashboard/bookings?booking=${booking.id}`)
  })
})
