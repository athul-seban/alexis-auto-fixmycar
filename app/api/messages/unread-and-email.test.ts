import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET, POST } from "./route"
import { GET as summary } from "./summary/route"
import { cleanupPrefix, makeGarage, makeOwner } from "@/test/fixtures"
import { createBooking } from "@/lib/portal/booking-service"
import { sendMail } from "@/lib/mail"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue({ success: true }) }))

const mockSession = vi.mocked(getServerSession)
const mockMail = vi.mocked(sendMail)
const PREFIX = "msgmail-"
const as = (id: string, role: string) => mockSession.mockResolvedValue({ user: { id, role } } as any)
const post = (body: unknown) => POST(new Request("http://x/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
const get = (bookingId: string) => GET(new Request(`http://x/api/messages?bookingId=${bookingId}`))

beforeEach(async () => {
  mockSession.mockReset()
  mockMail.mockClear()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

async function setup(portalSettings?: string) {
  const { user: garageUser, garage } = await makeGarage(PREFIX, { portalSettings })
  const { user: owner, vehicle } = await makeOwner(PREFIX)
  const booking = await createBooking({
    garageId: garage.id, source: "MARKETPLACE", ownerId: owner.id, vehicleId: vehicle.id,
    serviceType: "MOT", scheduledAt: new Date(Date.now() + 86400000), totalPrice: 50, notify: false,
  })
  mockMail.mockClear()
  return { garageUser, garage, owner, booking }
}

describe("emails on new messages", () => {
  it("emails the customer when the garage writes, once per burst", async () => {
    const { garageUser, owner, booking } = await setup()
    as(garageUser.id, "GARAGE")
    await post({ bookingId: booking.id, body: "Your car is ready" })
    await post({ bookingId: booking.id, body: "Open until 5pm" })

    expect(mockMail).toHaveBeenCalledTimes(1)
    expect(mockMail.mock.calls[0][0]).toMatchObject({ to: owner.email })
    expect(mockMail.mock.calls[0][0].subject).toMatch(/^New message from /)
    expect(mockMail.mock.calls[0][0].html).toContain("Your car is ready")
  })

  it("emails the garage when the customer writes, unless the garage switched that off", async () => {
    const { owner, booking, garage } = await setup()
    as(owner.id, "OWNER")
    await post({ bookingId: booking.id, body: "Can I drop it off early?" })
    expect(mockMail).toHaveBeenCalledTimes(1)
    expect(mockMail.mock.calls[0][0].to).toBe(garage.email)

    const quiet = await setup(JSON.stringify({ notifications: { emailMessage: false } }))
    mockMail.mockClear()
    as(quiet.owner.id, "OWNER")
    await post({ bookingId: quiet.booking.id, body: "Hello?" })
    expect(mockMail).not.toHaveBeenCalled()
    // ...but the in-app notification is unaffected.
    expect(await prisma.notification.count({ where: { garageId: quiet.garage.id, type: "MESSAGE_RECEIVED" } })).toBe(1)
  })

  it("still delivers the message when the email provider fails", async () => {
    const { garageUser, booking } = await setup()
    mockMail.mockRejectedValueOnce(new Error("smtp down"))
    as(garageUser.id, "GARAGE")
    expect((await post({ bookingId: booking.id, body: "Are you there?" })).status).toBe(201)
  })
})

describe("reading a thread", () => {
  it("marks the other side's messages read when you open it, and the unread badge follows", async () => {
    const { garageUser, owner, booking } = await setup()
    as(garageUser.id, "GARAGE")
    await post({ bookingId: booking.id, body: "hello" })

    as(owner.id, "OWNER")
    expect((await (await summary()).json()).unread).toBe(1)
    await get(booking.id)
    expect((await (await summary()).json()).unread).toBe(0)
  })

  it("does not mark messages read when an admin looks in", async () => {
    const { garageUser, owner, booking } = await setup()
    as(garageUser.id, "GARAGE")
    await post({ bookingId: booking.id, body: "hello" })

    as("admin", "ADMIN")
    expect((await get(booking.id)).status).toBe(200)
    as(owner.id, "OWNER")
    expect((await (await summary()).json()).unread).toBe(1)
  })
})

describe("GET /api/messages/summary", () => {
  it("requires sign-in and is per-role", async () => {
    mockSession.mockResolvedValue(null)
    expect((await summary()).status).toBe(401)
    as("admin", "ADMIN")
    expect((await summary()).status).toBe(403)
  })

  it("gives a garage its conversations with unread counts", async () => {
    const { garageUser, owner, booking } = await setup()
    as(owner.id, "OWNER")
    await post({ bookingId: booking.id, body: "Question about my MOT" })
    as(garageUser.id, "GARAGE")
    const body = await (await summary()).json()
    expect(body.unread).toBe(1)
    expect(body.threads[0]).toMatchObject({ key: `b:${booking.id}`, unread: 1, lastBody: "Question about my MOT" })
  })
})
