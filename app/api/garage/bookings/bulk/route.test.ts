import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { POST } from "./route"
import { cleanupPrefix, makeGarage, makeWalkInBooking } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "bulkbk-"
const post = (body: unknown) => POST(new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({}) } as any)

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("POST /api/garage/bookings/bulk", () => {
  it("confirms what it can and reports what it can't", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    mockSession.mockResolvedValue({ user: { id: user.id, role: "GARAGE" } } as any)
    const pending = await makeWalkInBooking(garage.id, { status: "PENDING" })
    const completed = await makeWalkInBooking(garage.id, { status: "COMPLETED" })

    const res = await post({ ids: [pending.id, completed.id, "missing"], action: "confirm" })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toEqual([pending.id])
    expect(body.failed.map((f: any) => f.id).sort()).toEqual([completed.id, "missing"].sort())
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("CONFIRMED")
    expect(await prisma.bookingEvent.count({ where: { bookingId: pending.id, type: "STATUS" } })).toBe(1)
  })

  it("never touches another garage's bookings", async () => {
    const { user } = await makeGarage(PREFIX, { key: "mine" })
    const { garage: other } = await makeGarage(PREFIX, { key: "other" })
    mockSession.mockResolvedValue({ user: { id: user.id, role: "GARAGE" } } as any)
    const theirs = await makeWalkInBooking(other.id, { status: "PENDING" })

    const body = await (await post({ ids: [theirs.id], action: "cancel", cancelReason: "x" })).json()
    expect(body.updated).toEqual([])
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: theirs.id } })).status).toBe("PENDING")
  })

  it("marks bookings contacted once and records the event", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    mockSession.mockResolvedValue({ user: { id: user.id, role: "GARAGE" } } as any)
    const b = await makeWalkInBooking(garage.id)
    await post({ ids: [b.id], action: "contacted" })
    await post({ ids: [b.id], action: "contacted" })
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).contactedAt).not.toBeNull()
    expect(await prisma.bookingEvent.count({ where: { bookingId: b.id, type: "CONTACTED" } })).toBe(1)
  })

  it("validates the selection size and blocks suspended garages", async () => {
    const { user } = await makeGarage(PREFIX, { status: "SUSPENDED" })
    mockSession.mockResolvedValue({ user: { id: user.id, role: "GARAGE" } } as any)
    expect((await post({ ids: ["a"], action: "confirm" })).status).toBe(403)
    const { user: active } = await makeGarage(PREFIX, { key: "active" })
    mockSession.mockResolvedValue({ user: { id: active.id, role: "GARAGE" } } as any)
    expect((await post({ ids: [], action: "confirm" })).status).toBe(400)
    expect((await post({ ids: Array.from({ length: 51 }, (_, i) => String(i)), action: "confirm" })).status).toBe(400)
  })
})
