import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET } from "./route"
import { POST } from "./blocks/route"
import { DELETE } from "./blocks/[id]/route"
import { cleanupPrefix, makeGarage, makeWalkInBooking } from "@/test/fixtures"
import { DEFAULT_OPENING_HOURS } from "@/lib/portal/opening-hours"
import { londonWallToUtc } from "@/lib/portal/tz"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "diarytest-"
const asUser = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE" } } as any)
const get = (qs = "") => GET(new Request(`http://x/api/garage/diary${qs ? `?${qs}` : ""}`))
const post = (body: unknown) => POST(new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
const del = (id: string) => DELETE(new Request("http://x", { method: "DELETE" }), { params: Promise.resolve({ id }) })
const at = (day: string, hhmm: string) => londonWallToUtc(day, hhmm)

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

// A week well in the future so "today" never interferes.
const WEEK = "from=2027-03-01&to=2027-03-07"

describe("GET /api/garage/diary", () => {
  it("returns bookings in the window (excluding cancelled and out-of-range ones) with opening hours and technicians", async () => {
    const { user, garage } = await makeGarage(PREFIX, { openingHours: DEFAULT_OPENING_HOURS })
    await prisma.technician.create({ data: { garageId: garage.id, name: "Tess", color: "#F97316" } })
    await makeWalkInBooking(garage.id, { customerName: "In window", scheduledAt: at("2027-03-03", "10:00") })
    await makeWalkInBooking(garage.id, { customerName: "Cancelled", scheduledAt: at("2027-03-03", "11:00"), status: "CANCELLED" })
    await makeWalkInBooking(garage.id, { customerName: "Next week", scheduledAt: at("2027-03-10", "10:00") })
    await makeWalkInBooking(garage.id, { customerName: "Last week", scheduledAt: at("2027-02-20", "10:00") })
    asUser(user.id)

    const body = await (await get(WEEK)).json()
    expect(body.range).toEqual({ from: "2027-03-01", to: "2027-03-07" })
    expect(body.bookings.map((b: any) => b.customerName)).toEqual(["In window"])
    expect(body.openingHours.monday).toEqual({ open: true, from: "09:00", to: "17:30" })
    expect(body.technicians).toHaveLength(1)
    expect(body.capacity).toBe(1)
  })

  it("includes a booking that started the evening before and runs into the window", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    await makeWalkInBooking(garage.id, { customerName: "Overnight", scheduledAt: at("2027-02-28", "22:00"), durationMins: 480 })
    await makeWalkInBooking(garage.id, { customerName: "Finished before", scheduledAt: at("2027-02-28", "09:00"), durationMins: 60 })
    asUser(user.id)
    const names = (await (await get(WEEK)).json()).bookings.map((b: any) => b.customerName)
    expect(names).toEqual(["Overnight"])
  })

  it("filters by technician, keeping garage-wide blocks and that technician's time off", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const tess = await prisma.technician.create({ data: { garageId: garage.id, name: "Tess" } })
    const marcus = await prisma.technician.create({ data: { garageId: garage.id, name: "Marcus" } })
    await makeWalkInBooking(garage.id, { customerName: "Tess job", technicianId: tess.id, scheduledAt: at("2027-03-02", "10:00") })
    await makeWalkInBooking(garage.id, { customerName: "Marcus job", technicianId: marcus.id, scheduledAt: at("2027-03-02", "12:00") })
    await prisma.diaryBlock.createMany({ data: [
      { garageId: garage.id, technicianId: null, startAt: at("2027-03-04", "00:00"), endAt: at("2027-03-05", "00:00"), allDay: true, reason: "Closed" },
      { garageId: garage.id, technicianId: tess.id, startAt: at("2027-03-05", "09:00"), endAt: at("2027-03-05", "12:00"), reason: "Dentist" },
      { garageId: garage.id, technicianId: marcus.id, startAt: at("2027-03-06", "09:00"), endAt: at("2027-03-06", "12:00"), reason: "Course" },
    ] })
    asUser(user.id)

    const body = await (await get(`${WEEK}&technicianId=${tess.id}`)).json()
    expect(body.bookings.map((b: any) => b.customerName)).toEqual(["Tess job"])
    expect(body.blocks.map((b: any) => b.reason).sort()).toEqual(["Closed", "Dentist"])
  })

  it("is scoped to the caller's garage", async () => {
    const mine = await makeGarage(PREFIX, { key: "mine" })
    const other = await makeGarage(PREFIX, { key: "other" })
    await makeWalkInBooking(other.garage.id, { scheduledAt: at("2027-03-03", "10:00") })
    await prisma.diaryBlock.create({ data: { garageId: other.garage.id, startAt: at("2027-03-03", "09:00"), endAt: at("2027-03-03", "10:00") } })
    asUser(mine.user.id)
    const body = await (await get(WEEK)).json()
    expect(body.bookings).toEqual([])
    expect(body.blocks).toEqual([])
  })

  it("defaults to the current week and validates the range", async () => {
    const { user } = await makeGarage(PREFIX)
    asUser(user.id)
    const body = await (await get()).json()
    expect(new Date(body.range.to).getTime() - new Date(body.range.from).getTime()).toBe(6 * 86400000)

    expect((await get("from=nope&to=2027-03-07")).status).toBe(400)
    expect((await get("from=2027-03-07&to=2027-03-01")).status).toBe(400)
    expect((await get("from=2027-01-01&to=2027-03-30")).status).toBe(400) // > 42 days
  })

  it("reflects the bay override in capacity", async () => {
    const { user } = await makeGarage(PREFIX, { portalSettings: JSON.stringify({ bays: 4 }) })
    asUser(user.id)
    expect((await (await get(WEEK)).json()).capacity).toBe(4)
  })
})

describe("diary blocks", () => {
  it("creates a block, reports overlapping bookings without touching them, and lists it", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const booking = await makeWalkInBooking(garage.id, { customerName: "Clash", scheduledAt: at("2027-03-03", "10:00"), durationMins: 60 })
    asUser(user.id)

    const res = await post({ startAt: at("2027-03-03", "09:00").toISOString(), endAt: at("2027-03-03", "12:00").toISOString(), reason: "Staff training" })
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.block).toMatchObject({ reason: "Staff training", allDay: false, technician: null })
    expect(body.conflicts).toHaveLength(1)
    expect(body.conflicts[0].customerName).toBe("Clash")
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CONFIRMED")

    expect((await (await get(WEEK)).json()).blocks).toHaveLength(1)
  })

  it("only reports a technician's own bookings when blocking that technician", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const tess = await prisma.technician.create({ data: { garageId: garage.id, name: "Tess" } })
    await makeWalkInBooking(garage.id, { customerName: "Tess job", technicianId: tess.id, scheduledAt: at("2027-03-03", "10:00") })
    await makeWalkInBooking(garage.id, { customerName: "Other job", scheduledAt: at("2027-03-03", "10:00") })
    asUser(user.id)

    const body = await (await post({ startAt: at("2027-03-03", "09:00").toISOString(), endAt: at("2027-03-03", "12:00").toISOString(), technicianId: tess.id })).json()
    expect(body.conflicts.map((c: any) => c.customerName)).toEqual(["Tess job"])
  })

  it("validates times, length and technician ownership", async () => {
    const { user } = await makeGarage(PREFIX)
    const { garage: other } = await makeGarage(PREFIX, { key: "other" })
    const alien = await prisma.technician.create({ data: { garageId: other.id, name: "Alien" } })
    asUser(user.id)
    const s = at("2027-03-03", "09:00")

    expect((await post({ startAt: s.toISOString(), endAt: s.toISOString() })).status).toBe(400)
    expect((await post({ startAt: s.toISOString(), endAt: new Date(s.getTime() - 3600000).toISOString() })).status).toBe(400)
    expect((await post({ startAt: s.toISOString(), endAt: new Date(s.getTime() + 61 * 86400000).toISOString() })).status).toBe(400)
    expect((await post({ startAt: "tomorrow", endAt: "later" })).status).toBe(400)
    expect((await post({ startAt: s.toISOString(), endAt: new Date(s.getTime() + 3600000).toISOString(), technicianId: alien.id })).status).toBe(400)
  })

  it("deletes only the caller's own blocks", async () => {
    const mine = await makeGarage(PREFIX, { key: "mine" })
    const other = await makeGarage(PREFIX, { key: "other" })
    const theirs = await prisma.diaryBlock.create({ data: { garageId: other.garage.id, startAt: at("2027-03-03", "09:00"), endAt: at("2027-03-03", "10:00") } })
    const ours = await prisma.diaryBlock.create({ data: { garageId: mine.garage.id, startAt: at("2027-03-03", "09:00"), endAt: at("2027-03-03", "10:00") } })
    asUser(mine.user.id)

    expect((await del(theirs.id)).status).toBe(404)
    expect(await prisma.diaryBlock.findUnique({ where: { id: theirs.id } })).not.toBeNull()
    expect((await del(ours.id)).status).toBe(200)
    expect(await prisma.diaryBlock.findUnique({ where: { id: ours.id } })).toBeNull()
  })

  it("a block makes the slot unavailable to new bookings", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const { findOverlaps } = await import("@/lib/portal/booking-service")
    asUser(user.id)
    await post({ startAt: at("2027-03-03", "09:00").toISOString(), endAt: at("2027-03-03", "17:00").toISOString(), allDay: true, reason: "Closed" })
    const o = await findOverlaps({ garageId: garage.id, start: at("2027-03-03", "10:00"), durationMins: 60 })
    expect(o).toMatchObject({ available: false, reason: "BLOCKED" })
  })

  it("is read-only for a suspended garage", async () => {
    const { user, garage } = await makeGarage(PREFIX, { status: "SUSPENDED" })
    const block = await prisma.diaryBlock.create({ data: { garageId: garage.id, startAt: at("2027-03-03", "09:00"), endAt: at("2027-03-03", "10:00") } })
    asUser(user.id)
    expect((await get(WEEK)).status).toBe(200)
    expect((await post({ startAt: at("2027-03-04", "09:00").toISOString(), endAt: at("2027-03-04", "10:00").toISOString() })).status).toBe(403)
    expect((await del(block.id)).status).toBe(403)
  })
})
