import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET, POST } from "./route"
import { GET as summary } from "./summary/route"
import { cleanupPrefix, makeGarage, makeLocation, makeOwner, makeStaff } from "@/test/fixtures"
import { createBooking } from "@/lib/portal/booking-service"
import { garageUnreadCount } from "@/lib/messaging"
import { sendMail } from "@/lib/mail"

// Messaging when a garage is several people: owner, staff and managers across more than one location.

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue({ success: true }) }))

const mockSession = vi.mocked(getServerSession)
const mockMail = vi.mocked(sendMail)
const PREFIX = "msgstaff-"
const as = (id: string, role: string) => mockSession.mockResolvedValue({ user: { id, role } } as never)
const post = (bookingId: string, body: string) => POST(new Request("http://x/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId, body }) }))
const read = (bookingId: string) => GET(new Request(`http://x/api/messages?bookingId=${bookingId}`))

beforeEach(async () => {
  mockSession.mockReset()
  mockMail.mockClear()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

async function setup() {
  const biz = await makeGarage(PREFIX, { key: "leeds" })
  const york = await makeLocation(PREFIX, biz.organisation!.id, { key: "york" })
  const staffA = await makeStaff(PREFIX, biz.organisation!.id, { key: "a", role: "staff" })
  const staffB = await makeStaff(PREFIX, biz.organisation!.id, { key: "b", role: "staff" })
  const { user: customer, vehicle } = await makeOwner(PREFIX)
  const booking = await createBooking({
    garageId: biz.garage.id, source: "MARKETPLACE", ownerId: customer.id, vehicleId: vehicle.id,
    serviceType: "MOT", scheduledAt: new Date(Date.now() + 86_400_000), totalPrice: 50, notify: false,
  })
  mockMail.mockClear()
  return { ...biz, york, staffA, staffB, customer, booking }
}

describe("who is sending", () => {
  it("records which side wrote each message, for any staff member (not just the owner)", async () => {
    const s = await setup()
    as(s.staffA.user.id, "GARAGE")
    await post(s.booking.id, "From staff A")
    as(s.customer.id, "OWNER")
    await post(s.booking.id, "From the customer")
    const rows = await prisma.message.findMany({ where: { bookingId: s.booking.id }, orderBy: { createdAt: "asc" } })
    expect(rows.map((m) => [m.body, m.fromGarage])).toEqual([["From staff A", true], ["From the customer", false]])
  })

  it("a customer message is unread for the garage until a member opens it; staff replies never count as unread for the garage", async () => {
    const s = await setup()
    as(s.customer.id, "OWNER")
    await post(s.booking.id, "Is it ready?")
    as(s.staffA.user.id, "GARAGE")
    await post(s.booking.id, "Yes, come after 4")
    expect(await garageUnreadCount({ id: s.garage.id, userId: s.user.id })).toBe(1)

    as(s.staffB.user.id, "GARAGE") // a colleague opens the thread
    expect((await read(s.booking.id)).status).toBe(200)
    expect(await garageUnreadCount({ id: s.garage.id, userId: s.user.id })).toBe(0)
  })

  it("a colleague opening the thread does NOT mark a staff reply as read for the customer (regression)", async () => {
    const s = await setup()
    as(s.staffA.user.id, "GARAGE")
    await post(s.booking.id, "Your car is ready")

    as(s.staffB.user.id, "GARAGE")
    await read(s.booking.id) // used to flip the reply to "read" because staffB isn't the sender

    as(s.customer.id, "OWNER")
    const inbox = await (await summary()).json()
    expect(inbox.unread).toBe(1)
    await read(s.booking.id) // now the customer reads it
    expect((await (await summary()).json()).unread).toBe(0)
  })
})

describe("who may read and reply", () => {
  it("staff can reach a thread at any location they hold, even when another is selected", async () => {
    const s = await setup()
    as(s.staffA.user.id, "GARAGE") // role Staff at all locations
    expect((await read(s.booking.id)).status).toBe(200)
    expect((await post(s.booking.id, "ok")).status).toBe(201)
  })

  it("a member assigned only to another location gets 403 (can't read or write another location's customers)", async () => {
    const s = await setup()
    const yorkOnly = await makeStaff(PREFIX, s.organisation!.id, { key: "yorkonly", role: "manager", locations: [s.york.id] })
    as(yorkOnly.user.id, "GARAGE")
    expect((await read(s.booking.id)).status).toBe(403)
    expect((await post(s.booking.id, "snooping")).status).toBe(403)
    expect(await prisma.message.count({ where: { bookingId: s.booking.id } })).toBe(0)
  })

  it("needs messages.view to read and messages.reply to write", async () => {
    const s = await setup()
    const viewer = await makeStaff(PREFIX, s.organisation!.id, { key: "viewer", permissions: ["messages.view"] })
    const noMessages = await makeStaff(PREFIX, s.organisation!.id, { key: "nomsg", permissions: ["bookings.view"] })

    as(viewer.user.id, "GARAGE")
    expect((await read(s.booking.id)).status).toBe(200)
    expect((await post(s.booking.id, "hi")).status).toBe(403)

    as(noMessages.user.id, "GARAGE")
    expect((await read(s.booking.id)).status).toBe(403)
    expect((await post(s.booking.id, "hi")).status).toBe(403)
    // and their inbox badge is simply empty rather than an error
    expect(await (await summary()).json()).toEqual({ threads: [], unread: 0 })
  })

  it("a removed (suspended) member can no longer read the thread", async () => {
    const s = await setup()
    await prisma.membership.update({ where: { id: s.staffA.membership.id }, data: { status: "SUSPENDED" } })
    as(s.staffA.user.id, "GARAGE")
    expect((await read(s.booking.id)).status).toBe(403)
  })

  it("the customer on the booking and an admin can still read; a stranger customer can't", async () => {
    const s = await setup()
    as(s.customer.id, "OWNER")
    expect((await read(s.booking.id)).status).toBe(200)
    const stranger = await makeOwner(PREFIX, "stranger")
    as(stranger.user.id, "OWNER")
    expect((await read(s.booking.id)).status).toBe(403)
    as("admin-1", "ADMIN")
    expect((await read(s.booking.id)).status).toBe(200)
  })
})

describe("emails", () => {
  it("emails the customer once for a burst of replies even when different staff send them", async () => {
    const s = await setup()
    as(s.staffA.user.id, "GARAGE")
    await post(s.booking.id, "Reply one")
    as(s.staffB.user.id, "GARAGE")
    await post(s.booking.id, "Reply two, from a colleague")
    expect(mockMail).toHaveBeenCalledTimes(1)
    expect(mockMail.mock.calls[0][0]).toMatchObject({ to: s.customer.email })
  })
})
