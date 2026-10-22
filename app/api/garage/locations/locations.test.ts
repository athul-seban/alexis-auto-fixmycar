import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { cleanupPrefix, makeGarage, makeLocation, makeStaff, makeWalkInBooking } from "@/test/fixtures"
import { resolveGarageAccess } from "@/lib/org/resolve"
import { MAX_LOCATIONS } from "@/lib/org/locations-service"
import { GET as listGet, POST as addPost } from "./route"
import { PATCH as actionPatch } from "./[id]/route"
import { PUT as pricingPut } from "../pricing/route"
import { PATCH as profilePatch } from "../../garages/[id]/route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "locsvc-"
const as = (id: string, role = "GARAGE") => mockSession.mockResolvedValue({ user: { id, role, email: `${id}@example.com` } } as never)
const jsonReq = (method: string, body?: unknown, headers: Record<string, string> = {}) => ({ method, headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
const req = (init?: RequestInit) => new Request("http://x/api/garage/locations", init)
const p = <T,>(v: T) => ({ params: Promise.resolve(v) })

const validLocation = (over: Record<string, unknown> = {}) => ({
  name: `${PREFIX}York branch`,
  phone: "01904 123456",
  email: `${PREFIX}york@garage.example.com`,
  address: "12 Micklegate",
  city: "York",
  postcode: "yo1 6jx",
  services: ["MOT", "FULL_SERVICE"],
  ...over,
})
const add = (body: unknown) => addPost(req(jsonReq("POST", body)))
const act = (id: string, body: unknown) => actionPatch(req(jsonReq("PATCH", body)), p({ id }))
const list = async () => (await listGet(req())).json() as Promise<{ locations: { id: string; name: string; status: string; isPrimary: boolean; upcomingBookings: number; staffCount: number }[]; limit: number }>

beforeEach(async () => {
  mockSession.mockReset()
  await prisma.auditLog.deleteMany({ where: { targetType: "LOCATION", detail: { contains: PREFIX } } })
  await cleanupPrefix(PREFIX)
})
afterEach(() => vi.unstubAllEnvs())
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { targetType: "LOCATION", detail: { contains: PREFIX } } })
  await cleanupPrefix(PREFIX)
})

/** A business with two locations; the signed-in user is its Owner. */
async function setup() {
  const biz = await makeGarage(PREFIX, { key: "leeds" })
  await prisma.organisation.update({ where: { id: biz.organisation!.id }, data: { vatNumber: "GB123456789" } })
  const second = await makeLocation(PREFIX, biz.organisation!.id, { key: "second" })
  as(biz.user.id)
  return { ...biz, second }
}

describe("adding a location", () => {
  it("creates a pending location of the same business, with no login of its own, and records who did it", async () => {
    const s = await setup()
    const res = await add(validLocation())
    expect(res.status).toBe(201)
    const created = await prisma.garage.findFirstOrThrow({ where: { name: `${PREFIX}York branch` } })
    expect(created).toMatchObject({ organisationId: s.organisation!.id, userId: null, status: "PENDING", isVerified: false, postcode: "YO1 6JX", vatNumber: "GB123456789" })
    expect(JSON.parse(created.services)).toEqual(["MOT", "FULL_SERVICE"])
    expect((await res.json()).location).toMatchObject({ id: created.id, status: "PENDING" })

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "LOCATION_ADDED", targetId: created.id } })
    expect(log).toMatchObject({ organisationId: s.organisation!.id, targetType: "LOCATION" })
  })

  it("is not on the marketplace until the platform approves it, and the Owner can open it straight away", async () => {
    const s = await setup()
    await add(validLocation())
    const created = await prisma.garage.findFirstOrThrow({ where: { name: `${PREFIX}York branch` } })
    expect(await prisma.garage.count({ where: { id: created.id, status: "APPROVED" } })).toBe(0)
    const access = await resolveGarageAccess(s.user.id, created.id)
    expect(access.ok && access.value.garage.id).toBe(created.id)
  })

  it("rejects bad input", async () => {
    await setup()
    for (const bad of [{ phone: "12" }, { email: "nope" }, { services: [] }, { postcode: "N1" }, { name: "x" }, { services: ["NOT_A_SERVICE"] }]) {
      expect((await add(validLocation(bad))).status, JSON.stringify(bad)).toBe(400)
    }
  })

  it("won't add the same name and postcode twice, but gives two branches with one name different web addresses", async () => {
    await setup()
    expect((await add(validLocation())).status).toBe(201)
    const again = await add(validLocation({ postcode: "YO1 6JX" }))
    expect(again.status).toBe(409)
    expect((await add(validLocation({ postcode: "YO10 3AA" }))).status).toBe(201)
    const slugs = (await prisma.garage.findMany({ where: { name: `${PREFIX}York branch` } })).map((g) => g.slug)
    expect(new Set(slugs).size).toBe(2)
  })

  it("stops at the limit; archived locations don't count towards it", async () => {
    const s = await setup()
    const have = await prisma.garage.count({ where: { organisationId: s.organisation!.id } })
    await prisma.garage.createMany({
      data: Array.from({ length: MAX_LOCATIONS - have }, (_, i) => ({
        organisationId: s.organisation!.id, name: `${PREFIX}bulk-${i}`, slug: `${PREFIX}bulk-${i}`, phone: "0123456789", email: `${PREFIX}b${i}@garage.example.com`,
        address: "1 Test St", city: "York", postcode: "YO1 1AA", status: "APPROVED", services: "[]",
      })),
    })
    const full = await add(validLocation())
    expect(full.status).toBe(409)
    expect((await full.json()).code).toBe("LIMIT")

    await prisma.garage.update({ where: { slug: `${PREFIX}bulk-0` }, data: { status: "ARCHIVED" } })
    expect((await add(validLocation())).status).toBe(201)
  })

  it("is refused for a garage that hasn't been set up as a business", async () => {
    const legacy = await makeGarage(PREFIX, { key: "legacy", legacy: true })
    as(legacy.user.id)
    const res = await add(validLocation())
    expect(res.status).toBe(409)
    expect(await prisma.garage.count({ where: { name: `${PREFIX}York branch` } })).toBe(0)
  })
})

describe("who may manage locations", () => {
  it("not a Manager, even at every location: locations are the business's, not a branch's", async () => {
    const s = await setup()
    const manager = await makeStaff(PREFIX, s.organisation!.id, { role: "manager" })
    as(manager.user.id)
    expect((await listGet(req())).status).toBe(403)
    expect((await add(validLocation())).status).toBe(403)
    expect((await act(s.second.id, { action: "archive" })).status).toBe(403)
  })

  it("a custom role with locations.manage works only when held at all locations", async () => {
    const s = await setup()
    const everywhere = await makeStaff(PREFIX, s.organisation!.id, { key: "ops", permissions: ["locations.manage"] })
    as(everywhere.user.id)
    expect((await add(validLocation())).status).toBe(201)

    const oneBranch = await makeStaff(PREFIX, s.organisation!.id, { key: "branch", permissions: ["locations.manage"], locations: [s.second.id] })
    as(oneBranch.user.id)
    expect((await add(validLocation({ name: `${PREFIX}other`, postcode: "YO2 2AA" }))).status).toBe(403)
  })

  it("is hidden entirely while the feature is off", async () => {
    await setup()
    vi.stubEnv("ORG_FEATURES", "staff")
    expect((await listGet(req())).status).toBe(404)
    expect((await add(validLocation())).status).toBe(404)
    expect(await prisma.garage.count({ where: { name: `${PREFIX}York branch` } })).toBe(0)
  })

  it("requires a signed-in garage login", async () => {
    mockSession.mockResolvedValue(null as never)
    expect((await listGet(req())).status).toBe(401)
    as("someone", "OWNER")
    expect((await listGet(req())).status).toBe(403)
  })
})

describe("the location list", () => {
  it("shows every location with its upcoming bookings and how many people work there", async () => {
    const s = await setup()
    await makeStaff(PREFIX, s.organisation!.id, { key: "leeds-only", role: "staff", locations: [s.garage.id] })
    await makeWalkInBooking(s.second.id, { status: "CONFIRMED" })
    await makeWalkInBooking(s.second.id, { status: "PENDING" })
    await makeWalkInBooking(s.second.id, { status: "COMPLETED", scheduledAt: new Date(Date.now() - 86_400_000) }) // history doesn't count
    await makeWalkInBooking(s.second.id, { status: "CANCELLED" })

    const body = await list()
    expect(body.limit).toBe(MAX_LOCATIONS)
    const byId = new Map(body.locations.map((l) => [l.id, l]))
    expect(byId.get(s.garage.id)).toMatchObject({ isPrimary: true, upcomingBookings: 0, staffCount: 2 }) // owner + the Leeds member
    expect(byId.get(s.second.id)).toMatchObject({ isPrimary: false, upcomingBookings: 2, staffCount: 1 }) // owner only
  })

  it("never shows another business's locations", async () => {
    const s = await setup()
    const other = await makeGarage(PREFIX, { key: "other" })
    const ids = (await list()).locations.map((l) => l.id)
    expect(ids).toContain(s.second.id)
    expect(ids).not.toContain(other.garage.id)
  })
})

describe("archiving and restoring", () => {
  it("closes a location, keeps its data, and audits it", async () => {
    const s = await setup()
    await makeWalkInBooking(s.second.id, { status: "COMPLETED", scheduledAt: new Date(Date.now() - 86_400_000) })
    const res = await act(s.second.id, { action: "archive" })
    expect(res.status).toBe(200)
    expect((await res.json()).location.status).toBe("ARCHIVED")
    expect(await prisma.booking.count({ where: { garageId: s.second.id } })).toBe(1)
    expect(await prisma.auditLog.count({ where: { action: "LOCATION_ARCHIVED", targetId: s.second.id, organisationId: s.organisation!.id } })).toBe(1)
    expect((await act(s.second.id, { action: "archive" })).status).toBe(200) // again: nothing more to do
  })

  it("won't close the only working location", async () => {
    const s = await setup()
    await act(s.second.id, { action: "archive" })
    const res = await act(s.garage.id, { action: "archive" })
    expect(res.status).toBe(409)
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: s.garage.id } })).status).toBe("APPROVED")
  })

  it("won't close a location that still has upcoming bookings, and says how many", async () => {
    const s = await setup()
    await makeWalkInBooking(s.second.id, { status: "CONFIRMED" })
    await makeWalkInBooking(s.second.id, { status: "PENDING" })
    const res = await act(s.second.id, { action: "archive" })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: "IN_USE", upcomingBookings: 2 })
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: s.second.id } })).status).toBe("APPROVED")
  })

  it("leaves a location the platform suspended for the platform to deal with", async () => {
    const s = await setup()
    await prisma.garage.update({ where: { id: s.second.id }, data: { status: "SUSPENDED" } })
    expect((await act(s.second.id, { action: "archive" })).status).toBe(409)
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: s.second.id } })).status).toBe("SUSPENDED")
    expect((await act(s.second.id, { action: "restore" })).status).toBe(200) // not archived: untouched
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: s.second.id } })).status).toBe("SUSPENDED")
  })

  it("treats another business's location as not found", async () => {
    await setup()
    const other = await makeGarage(PREFIX, { key: "other" })
    const res = await act(other.garage.id, { action: "archive" })
    expect(res.status).toBe(404)
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: other.garage.id } })).status).toBe("APPROVED")
    expect((await act("no-such-id", { action: "archive" })).status).toBe(404)
  })

  it("restores a location that was live back to live, and one that was never approved back to waiting", async () => {
    const s = await setup()
    await prisma.garage.update({ where: { id: s.second.id }, data: { isVerified: true } })
    await act(s.second.id, { action: "archive" })
    expect((await (await act(s.second.id, { action: "restore" })).json()).location.status).toBe("APPROVED")

    const fresh = await makeLocation(PREFIX, s.organisation!.id, { key: "fresh", status: "PENDING" })
    await act(fresh.id, { action: "archive" })
    expect((await (await act(fresh.id, { action: "restore" })).json()).location.status).toBe("PENDING")
    expect(await prisma.auditLog.count({ where: { action: "LOCATION_RESTORED", organisationId: s.organisation!.id } })).toBe(2)
  })

  it("rejects an unknown action", async () => {
    const s = await setup()
    expect((await act(s.second.id, { action: "delete" })).status).toBe(400)
    expect(await prisma.garage.count({ where: { id: s.second.id } })).toBe(1)
  })

  it("an archived location is read-only for everyone who works there, but can still be looked at", async () => {
    const s = await setup()
    const member = await makeStaff(PREFIX, s.organisation!.id, { role: "manager", locations: [s.second.id] })
    await act(s.second.id, { action: "archive" })

    as(member.user.id)
    const at = { "x-qmg-location": s.second.id }
    const write = await pricingPut(new Request("http://x", jsonReq("PUT", { prices: [] }, at)))
    expect(write.status).toBe(403)
    expect((await write.json()).code).toBe("LOCATION_ARCHIVED")

    const profile = await profilePatch(new Request("http://x", jsonReq("PATCH", { phone: "01234 567890" })), p({ id: s.second.id }))
    expect(profile.status).toBe(403)
    expect((await profile.json()).code).toBe("LOCATION_ARCHIVED")
  })

  it("signing in lands on a working location, not the closed one, even if it was the original", async () => {
    const s = await setup()
    await act(s.garage.id, { action: "archive" }) // the owner's own first location
    const landed = await resolveGarageAccess(s.user.id)
    expect(landed.ok && landed.value.garage.id).toBe(s.second.id)
    // It can still be opened on purpose, to look at its history.
    const looked = await resolveGarageAccess(s.user.id, s.garage.id)
    expect(looked.ok && looked.value.garage.id).toBe(s.garage.id)
  })

  it("a closed location is out of lead routing", async () => {
    const s = await setup()
    await act(s.second.id, { action: "archive" })
    expect(await prisma.garage.count({ where: { organisationId: s.organisation!.id, status: "APPROVED" } })).toBe(1)
  })
})
