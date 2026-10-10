import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET } from "./route"
import { cleanupPrefix, makeGarage, makeOwner, makeWalkInBooking } from "@/test/fixtures"
import { createBooking } from "@/lib/portal/booking-service"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "supporttest-"
const get = (qs: string) => GET(new Request(`http://x/api/admin/support?${qs}`))

beforeEach(async () => {
  mockSession.mockResolvedValue({ user: { id: "admin", role: "ADMIN", email: "admin@example.com" } } as any)
  await cleanupPrefix(PREFIX)
})
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { action: "SUPPORT_VIEW", detail: { contains: PREFIX } } })
  await cleanupPrefix(PREFIX)
})

describe("GET /api/admin/support — search", () => {
  it("finds accounts by email, by name and by garage name, case-insensitively", async () => {
    const { user } = await makeOwner(PREFIX, "Findable")
    const { user: gUser, garage } = await makeGarage(PREFIX, { key: "workshop" })
    const byEmail = (await (await get(`q=${encodeURIComponent(user.email.toUpperCase())}`)).json()).users
    expect(byEmail.map((u: any) => u.id)).toContain(user.id)
    const byGarage = (await (await get(`q=${encodeURIComponent(garage.name.toUpperCase())}`)).json()).users
    expect(byGarage.map((u: any) => u.id)).toContain(gUser.id)
  })

  it("won't search on fewer than three characters", async () => {
    expect((await (await get("q=ab")).json()).users).toEqual([])
  })

  it("never returns password hashes", async () => {
    const { user } = await makeOwner(PREFIX)
    await prisma.user.update({ where: { id: user.id }, data: { password: "$2a$hash" } })
    const text = await (await get(`q=${encodeURIComponent(user.email)}`)).text()
    expect(text).not.toContain("$2a$hash")
    expect(text).not.toContain('"password"')
  })
})

describe("GET /api/admin/support — account view", () => {
  it("shows a customer's bookings and vehicles, and records that an admin looked", async () => {
    const { garage } = await makeGarage(PREFIX)
    const { user, vehicle } = await makeOwner(PREFIX)
    await createBooking({ garageId: garage.id, source: "MARKETPLACE", ownerId: user.id, vehicleId: vehicle.id, serviceType: "MOT", scheduledAt: new Date(Date.now() + 86400000), totalPrice: 50, notify: false })

    const body = await (await get(`userId=${user.id}`)).json()
    expect(body.user.email).toBe(user.email)
    expect(body.bookings).toHaveLength(1)
    expect(body.vehicles).toHaveLength(1)
    expect(body.garage).toBeNull()
    expect(await prisma.auditLog.count({ where: { action: "SUPPORT_VIEW", targetId: user.id } })).toBe(1)
  })

  it("shows a garage its own bookings, plan and credits", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    await makeWalkInBooking(garage.id)
    await prisma.garage.update({ where: { id: garage.id }, data: { leadCredits: 4 } })
    const body = await (await get(`userId=${user.id}`)).json()
    expect(body.garage).toMatchObject({ name: garage.name, leadCredits: 4, plan: "FREE" })
    expect(body.bookings).toHaveLength(1)
  })

  it("404s for an unknown user without writing an audit entry", async () => {
    const before = await prisma.auditLog.count({ where: { action: "SUPPORT_VIEW" } })
    expect((await get("userId=nope")).status).toBe(404)
    expect(await prisma.auditLog.count({ where: { action: "SUPPORT_VIEW" } })).toBe(before)
  })

  it("is admin-only", async () => {
    mockSession.mockResolvedValue({ user: { id: "x", role: "OWNER" } } as any)
    expect((await get("q=anything")).status).toBe(401)
  })
})
