import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { cleanupPrefix, makeGarage, makeOwner, makeStaff } from "@/test/fixtures"
import { GET, PATCH } from "./route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "notifroute-"
const patch = (body: unknown) => new Request("http://localhost/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

let ownerId: string
let otherId: string
let garageId: string
let garageUserId: string

const note = (data: { userId?: string; garageId?: string; title: string; type?: string }) =>
  prisma.notification.create({ data: { type: "MESSAGE_RECEIVED", body: "b", ...data } })

beforeEach(async () => {
  await cleanupPrefix(PREFIX)
  const owner = await makeOwner(PREFIX, "me")
  const other = await makeOwner(PREFIX, "other")
  const g = await makeGarage(PREFIX)
  ownerId = owner.user.id
  otherId = other.user.id
  garageId = g.garage.id
  garageUserId = g.user.id
  await note({ userId: ownerId, title: "mine 1" })
  await note({ userId: ownerId, title: "mine 2" })
  await note({ userId: otherId, title: "someone else" })
  await note({ garageId, title: "garage only" })
  mockSession.mockResolvedValue({ user: { id: ownerId, role: "OWNER" } } as never)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("GET /api/notifications", () => {
  it("returns only the signed-in owner's notifications", async () => {
    const body = await (await GET()).json()
    expect(body.notifications.map((n: { title: string }) => n.title).sort()).toEqual(["mine 1", "mine 2"])
    expect(body.unreadCount).toBe(2)
  })

  it("returns a garage user the garage's notifications, not other users'", async () => {
    mockSession.mockResolvedValue({ user: { id: garageUserId, role: "GARAGE" } } as never)
    const body = await (await GET()).json()
    expect(body.notifications.map((n: { title: string }) => n.title)).toEqual(["garage only"])
  })

  it("shows staff only the kinds of notification their role covers", async () => {
    const { organisation } = await prisma.garage.findUniqueOrThrow({ where: { id: garageId }, include: { organisation: true } }).then((g) => ({ organisation: g.organisation! }))
    await note({ garageId, title: "new booking", type: "BOOKING_CREATED" })
    await note({ garageId, title: "billing notice", type: "GARAGE_STATUS_CHANGED" })
    await note({ garageId, title: "new review", type: "REVIEW_RECEIVED" })
    const desk = await makeStaff(PREFIX, organisation.id, { permissions: ["bookings.view"], locations: [garageId] })
    mockSession.mockResolvedValue({ user: { id: desk.user.id, role: "GARAGE" } } as never)

    const body = await (await GET()).json()
    expect(body.notifications.map((n: { title: string }) => n.title)).toEqual(["new booking"])
    expect(body.unreadCount).toBe(1)

    // The owner (everything) still sees them all.
    mockSession.mockResolvedValue({ user: { id: garageUserId, role: "GARAGE" } } as never)
    expect((await (await GET()).json()).notifications).toHaveLength(4)
  })

  it("hides a notification of a type nobody has mapped to a permission, rather than showing it to everyone", async () => {
    await note({ garageId, title: "mystery", type: "SOMETHING_NEW" })
    mockSession.mockResolvedValue({ user: { id: garageUserId, role: "GARAGE" } } as never)
    expect((await (await GET()).json()).notifications.map((n: { title: string }) => n.title)).not.toContain("mystery")
  })

  it("refuses a signed-out visitor", async () => {
    mockSession.mockResolvedValue(null as never)
    expect((await GET()).status).toBe(401)
  })

  it("refuses a session that has no user id, instead of listing everyone's notifications (regression)", async () => {
    // A revoked token used to produce { user: { id: undefined, role: undefined } }; `where: { userId: undefined }`
    // is dropped by Prisma, so the old code returned the latest 50 notifications of ALL users.
    for (const user of [{ id: undefined, role: undefined }, { id: "", role: "OWNER" }, { role: "OWNER" }, {}]) {
      mockSession.mockResolvedValue({ user } as never)
      const res = await GET()
      expect(res.status).toBe(401)
      expect(JSON.stringify(await res.json())).not.toContain("someone else")
    }
  })
})

describe("PATCH /api/notifications", () => {
  it("marks only the caller's own notifications read", async () => {
    expect((await PATCH(patch({ all: true }))).status).toBe(200)
    const unread = await prisma.notification.findMany({ where: { readAt: null, userId: { in: [ownerId, otherId] } } })
    expect(unread.map((n) => n.title)).toEqual(["someone else"])
  })

  it("marking all read as staff leaves what their role can't see untouched for the people it is meant for", async () => {
    const { organisation } = await prisma.garage.findUniqueOrThrow({ where: { id: garageId }, include: { organisation: true } }).then((g) => ({ organisation: g.organisation! }))
    await note({ garageId, title: "new booking", type: "BOOKING_CREATED" })
    const review = await note({ garageId, title: "new review", type: "REVIEW_RECEIVED" })
    const desk = await makeStaff(PREFIX, organisation.id, { permissions: ["bookings.view"], locations: [garageId] })
    mockSession.mockResolvedValue({ user: { id: desk.user.id, role: "GARAGE" } } as never)

    expect((await PATCH(patch({ all: true }))).status).toBe(200)
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: review.id } })).readAt).toBeNull()
    // Nor can they mark it by guessing its id.
    await PATCH(patch({ ids: [review.id] }))
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: review.id } })).readAt).toBeNull()
    expect((await prisma.notification.findFirstOrThrow({ where: { garageId, title: "new booking" } })).readAt).not.toBeNull()
  })

  it("cannot mark another user's notification read by id", async () => {
    const theirs = await prisma.notification.findFirstOrThrow({ where: { title: "someone else" } })
    await PATCH(patch({ ids: [theirs.id] }))
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt).toBeNull()
  })

  it("refuses a session with no user id and changes nothing (regression)", async () => {
    mockSession.mockResolvedValue({ user: { id: undefined, role: undefined } } as never)
    expect((await PATCH(patch({ all: true }))).status).toBe(401)
    expect(await prisma.notification.count({ where: { userId: { in: [ownerId, otherId] }, readAt: { not: null } } })).toBe(0)
  })

  it("rejects a malformed body", async () => {
    expect((await PATCH(patch({ ids: "nope" }))).status).toBe(400)
  })
})
