import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { GET } from "./route"
import { createBooking } from "@/lib/portal/booking-service"
import { prisma } from "@/lib/prisma"
import { cleanupPrefix, makeGarage } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "admwidget-"

beforeEach(async () => {
  mockSession.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } } as any)
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

async function widgetBooking(garageId: string, email: string, ipHash: string) {
  return createBooking({
    garageId, source: "WIDGET", customerName: "Visitor", customerEmail: email, vrm: "AB12CDE",
    serviceType: "MOT", scheduledAt: new Date(Date.now() + 5 * 86_400_000), totalPrice: 50, ipHash, notify: false,
  } as any)
}

describe("GET /api/admin/widgets", () => {
  it("lists garages with the widget on and flags repeat visitors", async () => {
    const { garage } = await makeGarage(PREFIX, { portalSettings: JSON.stringify({ widget: { enabled: true } }) })
    const { garage: off } = await makeGarage(PREFIX, { key: "off", portalSettings: JSON.stringify({ widget: { enabled: false } }) })
    for (let i = 0; i < 3; i++) await widgetBooking(garage.id, `same@${PREFIX}x.com`, "hash-a")
    await widgetBooking(garage.id, `other@${PREFIX}x.com`, "hash-b")

    const body = await (await GET()).json()
    const row = body.garages.find((g: any) => g.id === garage.id)
    expect(row).toMatchObject({ bookings7d: 4, lastHour: 4 })
    expect(body.garages.some((g: any) => g.id === off.id)).toBe(false)
    const mine = body.flags.filter((f: any) => f.garage === garage.name)
    expect(mine.map((f: any) => f.kind).sort()).toEqual(["email", "ip"])
    expect(mine.every((f: any) => f.count === 3)).toBe(true)
  })

  it("rejects non-admins", async () => {
    mockSession.mockResolvedValue({ user: { id: "u", role: "GARAGE" } } as any)
    expect((await GET()).status).toBe(401)
  })
})
