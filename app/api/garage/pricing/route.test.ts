import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET, PUT } from "./route"
import { SERVICE_TYPES } from "@/lib/constants"
import { cleanupPrefix, makeGarage } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "pricingtest-"
const asUser = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE" } } as any)
const put = (body: unknown) => PUT(new Request("http://x", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
const get = () => GET(new Request("http://x"))

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("garage pricing", () => {
  it("lists every service, flags the ones the garage offers, and defaults duration", async () => {
    const { user } = await makeGarage(PREFIX, { services: ["MOT", "BRAKES"] })
    asUser(user.id)

    const { services } = await (await get()).json()
    expect(services).toHaveLength(SERVICE_TYPES.length)
    const by = Object.fromEntries(services.map((s: any) => [s.serviceType, s]))
    expect(by.MOT).toMatchObject({ offered: true, priceFrom: null, durationMins: 60, isActive: true, configured: false, label: "MOT Test" })
    expect(by.BRAKES.offered).toBe(true)
    expect(by.CLUTCH).toMatchObject({ offered: false, durationMins: 240 })
  })

  it("saves prices (upsert) and returns the merged list", async () => {
    const { user, garage } = await makeGarage(PREFIX, { services: ["MOT", "BRAKES"] })
    asUser(user.id)

    const res = await put({ prices: [
      { serviceType: "MOT", priceFrom: 40, priceTo: 54.85, durationMins: 45, notes: "Class 4", isActive: true },
      { serviceType: "BRAKES", priceFrom: 120, priceTo: null, durationMins: 120, isActive: false },
    ] })
    expect(res.status).toBe(200)
    const by = Object.fromEntries((await res.json()).services.map((s: any) => [s.serviceType, s]))
    expect(by.MOT).toMatchObject({ priceFrom: 40, priceTo: 54.85, durationMins: 45, notes: "Class 4", configured: true })
    expect(by.BRAKES).toMatchObject({ priceFrom: 120, priceTo: null, isActive: false })

    // Second save updates in place rather than duplicating.
    await put({ prices: [{ serviceType: "MOT", priceFrom: 45, priceTo: 60, durationMins: 60, isActive: true }] })
    expect(await prisma.servicePrice.count({ where: { garageId: garage.id } })).toBe(2)
    expect((await prisma.servicePrice.findFirstOrThrow({ where: { garageId: garage.id, serviceType: "MOT" } })).priceFrom).toBe(45)
  })

  it("rejects services the garage doesn't offer, bad ranges and bad durations — saving nothing", async () => {
    const { user, garage } = await makeGarage(PREFIX, { services: ["MOT"] })
    asUser(user.id)

    const notOffered = await put({ prices: [{ serviceType: "CLUTCH", priceFrom: 100, durationMins: 120, isActive: true }] })
    expect(notOffered.status).toBe(400)
    expect((await notOffered.json()).error).toMatch(/isn't one of your services/)

    expect((await put({ prices: [{ serviceType: "MOT", priceFrom: 60, priceTo: 40, durationMins: 60, isActive: true }] })).status).toBe(400)
    expect((await put({ prices: [{ serviceType: "MOT", priceFrom: 10, durationMins: 5, isActive: true }] })).status).toBe(400)
    expect((await put({ prices: [] })).status).toBe(400)
    expect(await prisma.servicePrice.count({ where: { garageId: garage.id } })).toBe(0)
  })

  it("is per-garage and read-only for suspended garages", async () => {
    const a = await makeGarage(PREFIX, { key: "a" })
    const b = await makeGarage(PREFIX, { key: "b" })
    asUser(a.user.id)
    await put({ prices: [{ serviceType: "MOT", priceFrom: 50, durationMins: 60, isActive: true }] })

    asUser(b.user.id)
    expect((await (await get()).json()).services.find((s: any) => s.serviceType === "MOT").priceFrom).toBeNull()

    const s = await makeGarage(PREFIX, { key: "s", status: "SUSPENDED" })
    asUser(s.user.id)
    expect((await get()).status).toBe(200)
    expect((await put({ prices: [{ serviceType: "MOT", priceFrom: 1, durationMins: 60, isActive: true }] })).status).toBe(403)
  })
})
