import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET } from "./route"
import { cleanupPrefix, makeGarage, makeWalkInBooking } from "@/test/fixtures"
import { addDays, londonWallToUtc, todayLondon } from "@/lib/portal/tz"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "overviewtest-"
const asUser = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE" } } as any)
const get = (qs = "") => GET(new Request(`http://localhost/api/garage/overview${qs ? `?${qs}` : ""}`))
const D = (iso: string) => new Date(iso)

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

// A fixed historical window so the KPI maths doesn't depend on today's date.
const RANGE = "from=2026-09-01&to=2026-09-30"
const sched = "2026-09-10T10:00:00Z"
const made = "2026-09-05T10:00:00Z"
const b = (garageId: string, o: object) =>
  makeWalkInBooking(garageId, { scheduledAt: D(sched), createdAt: D(made), status: "COMPLETED", source: "MARKETPLACE", totalPrice: 100, ...o })

describe("GET /api/garage/overview — performance KPIs", () => {
  it("splits marketplace and widget, counting created by createdAt and attended/FIV by scheduledAt", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    await b(garage.id, { source: "MARKETPLACE", finalInvoiceValue: 130.5 })
    await b(garage.id, { source: "QUOTE", totalPrice: 80 })
    await b(garage.id, { source: "JOB_REQUEST", status: "IN_PROGRESS", totalPrice: 999 }) // attended, but not completed → no FIV
    await b(garage.id, { source: "WIDGET", totalPrice: 60 })
    await b(garage.id, { source: "WIDGET", status: "CONFIRMED" }) // created but not attended
    await b(garage.id, { source: "DIRECT", totalPrice: 40 })
    asUser(user.id)

    const body = await (await get(RANGE)).json()
    expect(body.range).toEqual({ from: "2026-09-01", to: "2026-09-30" })
    expect(body.marketplace).toEqual({ created: 3, attended: 3, fiv: 210.5 })
    expect(body.widget).toEqual({ created: 2, attended: 1, fiv: 60 })
    expect(body.direct).toEqual({ created: 1, attended: 1, fiv: 40 })
  })

  it("computes the no-show rate over attended + no-shows (null when nobody was due)", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    asUser(user.id)
    expect((await (await get(RANGE)).json()).noShowRate).toBeNull()

    await b(garage.id, {})
    await b(garage.id, {})
    await b(garage.id, {})
    await b(garage.id, { status: "NO_SHOW" })
    expect((await (await get(RANGE)).json()).noShowRate).toBe(25)
  })

  it("applies the range on London days, inclusive of the last day and exclusive after it", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    // 22:30Z on the 30th is 23:30 BST on the 30th (inside); 23:30Z is 00:30 BST on 1 Oct (outside).
    await b(garage.id, { scheduledAt: D("2026-09-30T22:30:00Z"), createdAt: D("2026-09-30T22:30:00Z"), customerName: "inside" })
    await b(garage.id, { scheduledAt: D("2026-09-30T23:30:00Z"), createdAt: D("2026-09-30T23:30:00Z"), customerName: "outside" })
    asUser(user.id)

    const body = await (await get(RANGE)).json()
    expect(body.marketplace.created).toBe(1)
    expect(body.marketplace.attended).toBe(1)
  })

  it("only counts the caller's own garage", async () => {
    const mine = await makeGarage(PREFIX, { key: "mine" })
    const other = await makeGarage(PREFIX, { key: "other" })
    await b(mine.garage.id, {})
    await b(other.garage.id, {})
    await b(other.garage.id, {})
    asUser(mine.user.id)
    expect((await (await get(RANGE)).json()).marketplace.attended).toBe(1)
  })

  it("defaults to the last 14 days and validates the range", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const today = todayLondon()
    await b(garage.id, { scheduledAt: londonWallToUtc(addDays(today, -13), "12:00"), createdAt: londonWallToUtc(addDays(today, -13), "09:00") })
    await b(garage.id, { scheduledAt: londonWallToUtc(addDays(today, -20), "12:00"), createdAt: londonWallToUtc(addDays(today, -20), "09:00") })
    asUser(user.id)

    const body = await (await get()).json()
    expect(body.range).toEqual({ from: addDays(today, -13), to: today })
    expect(body.marketplace.attended).toBe(1)

    expect((await get("from=nope&to=2026-09-30")).status).toBe(400)
    expect((await get("from=2026-09-30&to=2026-09-01")).status).toBe(400)
    expect((await get("from=2026-09-01")).status).toBe(400)
    expect((await get("from=2019-01-01&to=2026-09-30")).status).toBe(400)
  })
})

describe("GET /api/garage/overview — today and listing", () => {
  it("counts due-today, created-today (London midnight edge) and bookings awaiting an outcome", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const today = todayLondon()
    const at = (day: number, time: string) => londonWallToUtc(addDays(today, day), time)
    await makeWalkInBooking(garage.id, { status: "CONFIRMED", scheduledAt: at(0, "23:30"), createdAt: at(-3, "10:00"), customerName: "due today" })
    await makeWalkInBooking(garage.id, { status: "CANCELLED", scheduledAt: at(0, "23:00"), createdAt: at(-3, "10:00"), customerName: "cancelled today" })
    await makeWalkInBooking(garage.id, { status: "CONFIRMED", scheduledAt: at(5, "10:00"), createdAt: at(0, "00:30"), customerName: "made just after midnight" })
    await makeWalkInBooking(garage.id, { status: "CONFIRMED", scheduledAt: at(5, "10:00"), createdAt: at(-1, "23:30"), customerName: "made before midnight" })
    await makeWalkInBooking(garage.id, { status: "CONFIRMED", scheduledAt: at(-9, "10:00"), createdAt: at(-12, "10:00"), customerName: "old, no outcome" })
    await makeWalkInBooking(garage.id, { status: "PENDING", scheduledAt: at(-2, "10:00"), createdAt: at(-5, "10:00"), customerName: "pending, no outcome" })
    await makeWalkInBooking(garage.id, { status: "COMPLETED", scheduledAt: at(-2, "10:00"), createdAt: at(-5, "10:00"), customerName: "done" })
    asUser(user.id)

    const { today: t } = await (await get()).json()
    expect(t.dueToday).toBe(1)
    expect(t.createdToday).toBe(1)
    expect(t.needsOutcome).toBe(2)
  })

  it("reports the listing status and any new enquiries, and works for a suspended garage", async () => {
    const { user, garage } = await makeGarage(PREFIX, { status: "SUSPENDED" })
    asUser(user.id)

    const body = await (await get()).json()
    expect(body.garage).toMatchObject({ name: garage.name, slug: garage.slug, status: "SUSPENDED" })
    expect(body.pendingEnquiries).toBe(0)

    const owner = await prisma.user.create({ data: { email: `${PREFIX}o@example.com`, role: "OWNER" } })
    const vehicle = await prisma.vehicle.create({ data: { ownerId: owner.id, registration: "AB12CDE", make: "Ford", model: "Focus", year: 2019 } })
    await prisma.quote.create({ data: { ownerId: owner.id, vehicleId: vehicle.id, garageId: garage.id, serviceType: "MOT", description: "Needs an MOT test", status: "PENDING" } })
    expect((await (await get()).json()).pendingEnquiries).toBe(1)
  })

  it("compares with the previous period and lists today's bookings, checklist and unreplied reviews", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    // Previous window of equal length (Aug 2026 is 31 days; the range below is 30, so use 2026-08-02..2026-08-31 before it).
    await b(garage.id, { scheduledAt: D("2026-08-20T10:00:00Z"), createdAt: D("2026-08-18T10:00:00Z") })
    await b(garage.id, { scheduledAt: D("2026-08-21T10:00:00Z"), createdAt: D("2026-08-19T10:00:00Z") })
    await b(garage.id, {})
    await makeWalkInBooking(garage.id, { scheduledAt: new Date(), createdAt: new Date(), status: "CONFIRMED", customerName: "Today Tim" })
    asUser(user.id)

    const body = await (await get(RANGE)).json()
    expect(body.marketplace.created).toBe(1)
    expect(body.previous.marketplace.created).toBe(2)
    expect(body.todayBookings.map((x: any) => x.customer)).toContain("Today Tim")
    expect(body.unrepliedReviews).toBe(0)
    expect(body.unreadMessages).toBe(0)
    expect(body.readiness).toEqual({ ready: expect.any(Boolean), missing: expect.any(Array) })
  })

  it("rejects non-garage callers", async () => {
    mockSession.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
  })
})
