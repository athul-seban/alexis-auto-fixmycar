import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET, POST } from "./route"
import { PATCH, DELETE } from "./[id]/route"
import { cleanupPrefix, makeGarage, makeWalkInBooking } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "techtest-"
const asUser = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE" } } as any)
const json = (method: string, body?: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("technicians API", () => {
  it("creates, lists (active first) and updates technicians", async () => {
    const { user } = await makeGarage(PREFIX)
    asUser(user.id)

    const created = await POST(new Request("http://localhost/api/garage/technicians", json("POST", { name: "Tess", color: "#F97316", email: "tess@example.com" })))
    expect(created.status).toBe(201)
    const tess = (await created.json()).technician
    expect(tess).toMatchObject({ name: "Tess", color: "#F97316", isActive: true })

    await POST(new Request("http://localhost/api/garage/technicians", json("POST", { name: "Old Hand", isActive: false })))
    const list = (await (await GET(new Request("http://localhost/api/garage/technicians"))).json()).technicians
    expect(list.map((t: any) => t.name)).toEqual(["Tess", "Old Hand"])

    const patched = await PATCH(new Request("http://x", json("PATCH", { name: "Tessa", isActive: false })), ctx(tess.id))
    expect((await patched.json()).technician).toMatchObject({ name: "Tessa", isActive: false })
  })

  it("validates input", async () => {
    const { user } = await makeGarage(PREFIX)
    asUser(user.id)
    const bad = (body: object) => POST(new Request("http://x", json("POST", body)))
    expect((await bad({ name: "" })).status).toBe(400)
    expect((await bad({ name: "X", color: "red" })).status).toBe(400)
    expect((await bad({ name: "X", email: "not-an-email" })).status).toBe(400)
  })

  it("is scoped to the caller's garage", async () => {
    const a = await makeGarage(PREFIX, { key: "a" })
    const b = await makeGarage(PREFIX, { key: "b" })
    const theirs = await prisma.technician.create({ data: { garageId: b.garage.id, name: "Theirs" } })
    asUser(a.user.id)

    expect((await (await GET(new Request("http://x"))).json()).technicians).toEqual([])
    expect((await PATCH(new Request("http://x", json("PATCH", { name: "Hijack" })), ctx(theirs.id))).status).toBe(404)
    expect((await DELETE(new Request("http://x", json("DELETE")), ctx(theirs.id))).status).toBe(404)
    expect((await prisma.technician.findUniqueOrThrow({ where: { id: theirs.id } })).name).toBe("Theirs")
  })

  it("deletes an unused technician but only deactivates one with bookings", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    asUser(user.id)
    const unused = await prisma.technician.create({ data: { garageId: garage.id, name: "Unused" } })
    const busy = await prisma.technician.create({ data: { garageId: garage.id, name: "Busy" } })
    await makeWalkInBooking(garage.id, { technicianId: busy.id })

    const del = await (await DELETE(new Request("http://x", json("DELETE")), ctx(unused.id))).json()
    expect(del).toEqual({ success: true, deactivated: false })
    expect(await prisma.technician.findUnique({ where: { id: unused.id } })).toBeNull()

    const soft = await (await DELETE(new Request("http://x", json("DELETE")), ctx(busy.id))).json()
    expect(soft).toEqual({ success: true, deactivated: true })
    expect((await prisma.technician.findUniqueOrThrow({ where: { id: busy.id } })).isActive).toBe(false)
  })

  it("blocks writes for suspended garages but allows reading", async () => {
    const { user } = await makeGarage(PREFIX, { status: "SUSPENDED" })
    asUser(user.id)
    expect((await GET(new Request("http://x"))).status).toBe(200)
    expect((await POST(new Request("http://x", json("POST", { name: "X" })))).status).toBe(403)
  })
})
