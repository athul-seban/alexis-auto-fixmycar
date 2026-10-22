import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { cleanupPrefix, makeGarage, makeOwner } from "@/test/fixtures"
import { DELETE, PATCH } from "./route"
import { GET as history } from "./history/route"

// Complements route.test.ts: revoked sessions, signed-out visitors, and the vehicle history endpoint.

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "vehsession-"
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const patchReq = (body: unknown) => new Request("http://localhost/api/vehicles/x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const delReq = () => new Request("http://localhost/api/vehicles/x", { method: "DELETE" })
const getReq = () => new Request("http://localhost/api/vehicles/x/history")

let mine: { id: string }
let theirs: { id: string }
let meId: string

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
  const me = await makeOwner(PREFIX, "me")
  const other = await makeOwner(PREFIX, "other")
  meId = me.user.id
  mine = me.vehicle
  theirs = other.vehicle
  mockSession.mockResolvedValue({ user: { id: meId, role: "OWNER" } } as never)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("vehicle routes: sessions without a usable user id", () => {
  it("a revoked session (no user id) can't touch ANY vehicle (regression)", async () => {
    // `findFirst({ where: { id, ownerId: undefined } })` matched any vehicle by id, because Prisma drops undefined filters.
    for (const user of [{ id: undefined, role: undefined }, { id: "", role: "OWNER" }, {}]) {
      mockSession.mockResolvedValue({ user } as never)
      expect((await PATCH(patchReq({ make: "Hacked" }), ctx(theirs.id))).status).toBe(401)
      expect((await DELETE(delReq(), ctx(theirs.id))).status).toBe(401)
      expect((await history(getReq(), ctx(theirs.id))).status).toBe(401)
    }
    expect(await prisma.vehicle.count({ where: { id: { in: [mine.id, theirs.id] } } })).toBe(2)
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: theirs.id } })).make).toBe("Ford")
  })

  it("refuses a signed-out visitor", async () => {
    mockSession.mockResolvedValue(null as never)
    expect((await PATCH(patchReq({ make: "x" }), ctx(mine.id))).status).toBe(401)
    expect((await DELETE(delReq(), ctx(mine.id))).status).toBe(401)
    expect((await history(getReq(), ctx(mine.id))).status).toBe(401)
  })
})

describe("GET /api/vehicles/[id]/history", () => {
  it("returns the owner's completed bookings for their own vehicle only", async () => {
    const g = await makeGarage(PREFIX)
    await prisma.booking.create({
      data: { garageId: g.garage.id, ownerId: meId, vehicleId: mine.id, serviceType: "MOT", status: "COMPLETED", scheduledAt: new Date(), completedAt: new Date(), totalPrice: 40, reference: `${PREFIX}ref1` } as never,
    })
    const body = await (await history(getReq(), ctx(mine.id))).json()
    expect(body.history).toHaveLength(1)
    expect(body.history[0].garage.id).toBe(g.garage.id)
  })

  it("404s another owner's vehicle", async () => {
    expect((await history(getReq(), ctx(theirs.id))).status).toBe(404)
  })
})
