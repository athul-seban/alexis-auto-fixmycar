import { describe, it, expect, vi, beforeEach, afterAll, afterEach } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET } from "./route"
import { cleanupPrefix, makeGarage, makeOwner, makeWalkInBooking } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "insighttest-"
const asUser = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE" } } as any)
const get = (qs = "") => GET(new Request(`http://x/api/garage/insights${qs ? `?${qs}` : ""}`))
const D = (iso: string) => new Date(iso)
const RANGE = "from=2026-09-01&to=2026-09-30"

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

const b = (garageId: string, o: object = {}) =>
  makeWalkInBooking(garageId, { status: "COMPLETED", source: "WIDGET", serviceType: "MOT", totalPrice: 100, scheduledAt: D("2026-09-10T10:00:00Z"), createdAt: D("2026-09-05T10:00:00Z"), ...o })

describe("GET /api/garage/insights", () => {
  it("returns a bucketed series, totals and breakdowns for the range", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    await b(garage.id, { finalInvoiceValue: 130 })
    await b(garage.id, { source: "MARKETPLACE", serviceType: "BRAKES", totalPrice: 220 })
    await b(garage.id, { status: "NO_SHOW" })
    await b(garage.id, { status: "CANCELLED", source: "DIRECT" })
    asUser(user.id)

    const body = await (await get(`${RANGE}&granularity=week`)).json()
    expect(body.granularity).toBe("week")
    expect(body.series.map((p: any) => p.bucket)).toEqual(["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"])
    expect(body.totals).toEqual({ created: 4, attended: 2, noShow: 1, revenue: 350 })
    expect(body.bySource).toEqual([{ key: "WIDGET", count: 2, revenue: 130 }, { key: "MARKETPLACE", count: 1, revenue: 220 }])
    expect(body.byChannel.map((c: any) => c.key)).toEqual(["widget", "marketplace"])
    expect(body.byService.find((s: any) => s.key === "BRAKES")).toMatchObject({ count: 1, revenue: 220 })
  })

  it("builds the quote funnel from this garage's requests and responses in the range", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const { user: owner, vehicle } = await makeOwner(PREFIX)
    const q = (status: string, price?: number) => prisma.quote.create({ data: { ownerId: owner.id, vehicleId: vehicle.id, garageId: garage.id, serviceType: "MOT", description: "Needs an MOT test", status, price, createdAt: D("2026-09-10T10:00:00Z") } })
    await q("PENDING"); await q("SENT", 50); await q("ACCEPTED", 60)
    asUser(user.id)
    const { funnel } = await (await get(RANGE)).json()
    expect(funnel).toEqual({ requests: 3, quoted: 2, booked: 1, winRate: 50 })
  })

  it("defaults to the last three months with an automatic granularity", async () => {
    const { user } = await makeGarage(PREFIX)
    asUser(user.id)
    const body = await (await get()).json()
    expect(body.granularity).toBe("week")
    expect(body.series.length).toBeGreaterThan(10)
  })

  it("is scoped to the caller's garage", async () => {
    const mine = await makeGarage(PREFIX, { key: "mine" })
    const other = await makeGarage(PREFIX, { key: "other" })
    await b(other.garage.id)
    asUser(mine.user.id)
    expect((await (await get(RANGE)).json()).totals).toEqual({ created: 0, attended: 0, noShow: 0, revenue: 0 })
  })

  it("validates the range and granularity", async () => {
    const { user } = await makeGarage(PREFIX)
    asUser(user.id)
    expect((await get("from=nope&to=2026-09-30")).status).toBe(400)
    expect((await get("from=2026-09-30&to=2026-09-01")).status).toBe(400)
    expect((await get(`${RANGE}&granularity=hourly`)).status).toBe(400)
    expect((await get("from=2025-01-01&to=2025-12-31&granularity=day")).status).toBe(400) // too many daily points
    expect((await get("from=2025-01-01&to=2025-12-31&granularity=month")).status).toBe(200)
  })

  it("rejects non-garage callers", async () => {
    mockSession.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
  })
})

describe("GET /api/garage/insights — plan gating", () => {
  afterEach(() => {
    delete process.env.PLANS_ENFORCED
  })

  it("is open to everyone until plans are enforced", async () => {
    const { user } = await makeGarage(PREFIX)
    asUser(user.id)
    expect((await get(RANGE)).status).toBe(200)
  })

  it("asks a free garage to upgrade (402 PLAN_REQUIRED) once enforced, but not a paying one", async () => {
    process.env.PLANS_ENFORCED = "true"
    const free = await makeGarage(PREFIX, { key: "free" })
    asUser(free.user.id)
    const res = await get(RANGE)
    expect(res.status).toBe(402)
    expect((await res.json()).code).toBe("PLAN_REQUIRED")

    const paid = await makeGarage(PREFIX, { key: "paid" })
    await prisma.garage.update({ where: { id: paid.garage.id }, data: { plan: "PRO", subscriptionStatus: "active" } })
    asUser(paid.user.id)
    expect((await get(RANGE)).status).toBe(200)
  })
})
