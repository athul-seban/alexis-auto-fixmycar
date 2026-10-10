import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { GET } from "./route"
import { GET as overviewGET } from "../overview/route"
import { prisma } from "@/lib/prisma"
import { cleanupPrefix, makeGarage, makeOwner, makeWalkInBooking } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "adminbooktest-"

beforeEach(async () => {
  await cleanupPrefix(PREFIX)
  // The overview re-checks the role in the database, so the session needs a real admin row.
  const { user } = await makeOwner(PREFIX)
  await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } })
  mockSession.mockResolvedValue({ user: { id: user.id, role: "ADMIN" } } as any)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("admin views with walk-in bookings (no owner account)", () => {
  it("GET /api/admin/bookings falls back to the captured customer name and reports the source", async () => {
    const { garage } = await makeGarage(PREFIX)
    await makeWalkInBooking(garage.id, { customerName: "Walk In Wendy" })

    const res = await GET(new Request("http://localhost/api/admin/bookings?pageSize=50"))
    expect(res.status).toBe(200)
    const { bookings } = await res.json()
    const mine = bookings.find((b: any) => b.garage === garage.name)

    expect(mine.customer).toBe("Walk In Wendy")
    expect(mine.source).toBe("DIRECT")
  })

  it("falls back to a generic label when no name was captured", async () => {
    const { garage } = await makeGarage(PREFIX)
    await makeWalkInBooking(garage.id, { customerName: null })

    const res = await GET(new Request("http://localhost/api/admin/bookings?pageSize=50"))
    const { bookings } = await res.json()
    expect(bookings.find((b: any) => b.garage === garage.name).customer).toBe("Walk-in customer")
  })

  it("GET /api/admin/overview builds its activity feed without crashing on a null owner", async () => {
    const { garage } = await makeGarage(PREFIX)
    // The feed shows only the newest few bookings; files run in parallel, so make this one decisively newest.
    await makeWalkInBooking(garage.id, { customerName: "Feed Fiona", createdAt: new Date(Date.now() + 365 * 86400000) })

    const res = await overviewGET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(JSON.stringify(body.activity)).toContain("Feed Fiona")
  })

  it("is admin-only", async () => {
    mockSession.mockResolvedValue({ user: { id: "x", role: "GARAGE" } } as any)
    expect((await GET(new Request("http://localhost/api/admin/bookings"))).status).toBe(401)
  })
})

describe("GET /api/admin/overview access and shape", () => {
  it("rejects a token that still says ADMIN after the account was demoted", async () => {
    const { user } = await makeOwner(PREFIX)
    mockSession.mockResolvedValue({ user: { id: user.id, role: "ADMIN" } } as any) // DB role is OWNER
    expect((await overviewGET()).status).toBe(401)
  })

  it("returns the attention queue, charts data and aggregated cities", async () => {
    const { garage } = await makeGarage(PREFIX)
    await makeWalkInBooking(garage.id, { customerName: "Shape Sam" })
    const body = await (await overviewGET()).json()
    expect(body.attention).toEqual(expect.objectContaining({ pendingGarages: expect.any(Number), openDisputes: expect.any(Number) }))
    expect(body.revenueTrend).toHaveLength(30)
    expect(body.topCities.length).toBeGreaterThan(0)
    expect(body.serviceBreakdown.every((x: any) => typeof x.count === "number")).toBe(true)
  })
})
