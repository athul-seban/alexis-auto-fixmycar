import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET, PATCH, POST } from "./route"
import { cleanupPrefix, makeGarage } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "admgarage-"

const open = { open: true, from: "09:00", to: "17:00" }
const week = Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, open]))
const json = (method: string, body: unknown) =>
  new Request("http://x", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

async function readyGarage(status = "PENDING") {
  const { garage } = await makeGarage(PREFIX, { status, openingHours: week })
  return prisma.garage.update({ where: { id: garage.id }, data: { description: "A well-established independent garage with a full range of services." } })
}

beforeEach(async () => {
  mockSession.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } } as any)
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("GET /api/admin/garages", () => {
  it("lists garages with a readiness checklist", async () => {
    const ready = await readyGarage()
    const { garage: bare } = await makeGarage(PREFIX, { status: "PENDING", key: "bare" })
    const res = await GET(new Request(`http://x?status=PENDING&q=${PREFIX}&pageSize=50`))
    const body = await res.json()
    const byId = new Map<string, any>(body.garages.map((g: any) => [g.id, g]))
    expect(byId.get(ready.id).readiness.ready).toBe(true)
    expect(byId.get(bare.id).readiness.ready).toBe(false)
    expect(byId.get(bare.id).readiness.missingRequired).toContain("Opening hours")
    expect(byId.get(bare.id).owner.email).toContain(PREFIX)
  })

  it("rejects non-admins", async () => {
    mockSession.mockResolvedValue({ user: { id: "u", role: "OWNER" } } as any)
    expect((await GET(new Request("http://x"))).status).toBe(401)
  })
})

describe("POST /api/admin/garages", () => {
  it("approves a ready garage and notifies it", async () => {
    const g = await readyGarage()
    const res = await POST(json("POST", { garageId: g.id, action: "approve" }))
    expect(res.status).toBe(200)
    expect(await prisma.garage.findUniqueOrThrow({ where: { id: g.id } })).toMatchObject({ status: "APPROVED", isVerified: true })
    const notes = await prisma.notification.findMany({ where: { garageId: g.id } })
    expect(notes).toHaveLength(1)
    expect(notes[0].type).toBe("GARAGE_STATUS_CHANGED")
  })

  it("refuses to approve an incomplete profile unless forced", async () => {
    const { garage } = await makeGarage(PREFIX, { status: "PENDING" })
    const blocked = await POST(json("POST", { garageId: garage.id, action: "approve" }))
    expect(blocked.status).toBe(409)
    const body = await blocked.json()
    expect(body.code).toBe("NOT_READY")
    expect(body.missing).toContain("Description (30+ characters)")
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).status).toBe("PENDING")

    const forced = await POST(json("POST", { garageId: garage.id, action: "approve", force: true }))
    expect(forced.status).toBe(200)
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).status).toBe("APPROVED")
  })

  it("suspends with a reason in the notification and doesn't re-notify when nothing changes", async () => {
    const g = await readyGarage("APPROVED")
    await POST(json("POST", { garageId: g.id, action: "suspend", reason: "Bad reviews" }))
    await POST(json("POST", { garageId: g.id, action: "suspend" }))
    const notes = await prisma.notification.findMany({ where: { garageId: g.id } })
    expect(notes).toHaveLength(1)
    expect(notes[0].body).toContain("Bad reviews")
  })

  it("404s for an unknown garage", async () => {
    expect((await POST(json("POST", { garageId: "nope", action: "suspend" }))).status).toBe(404)
  })
})

describe("PATCH /api/admin/garages", () => {
  it("stores de-duplicated badges and rejects unknown ones", async () => {
    const g = await readyGarage()
    expect((await PATCH(json("PATCH", { garageId: g.id, badges: ["ID_VERIFIED", "ID_VERIFIED"] }))).status).toBe(200)
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: g.id } })).verificationBadges).toBe(JSON.stringify(["ID_VERIFIED"]))
    expect((await PATCH(json("PATCH", { garageId: g.id, badges: ["BOGUS"] }))).status).toBe(400)
  })
})
