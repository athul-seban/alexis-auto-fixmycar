import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { PATCH, DELETE } from "./route"
import { cleanupPrefix, makeGarage, makeOwner } from "@/test/fixtures"
import { createBooking } from "@/lib/portal/booking-service"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "vehicleidtest-"
const asOwner = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "OWNER" } } as any)
const patch = (id: string, body: unknown) =>
  PATCH(new Request("http://x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })
const del = (id: string) => DELETE(new Request("http://x", { method: "DELETE" }), { params: Promise.resolve({ id }) })

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("PATCH /api/vehicles/[id]", () => {
  it("uppercases the registration and lets optional fields be cleared with null", async () => {
    const { user, vehicle } = await makeOwner(PREFIX)
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { fuel: "Petrol", mileage: 40000, motDueDate: new Date("2027-01-01T00:00:00Z") } })
    asOwner(user.id)

    const res = await patch(vehicle.id, { registration: " xy99 zzz ", fuel: null, mileage: null, motDueDate: null })
    expect(res.status).toBe(200)
    const after = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })
    expect(after).toMatchObject({ registration: "XY99 ZZZ", fuel: null, mileage: null, motDueDate: null })
  })

  it("won't touch another owner's vehicle", async () => {
    const mine = await makeOwner(PREFIX, "mine")
    const theirs = await makeOwner(PREFIX, "theirs")
    asOwner(mine.user.id)
    expect((await patch(theirs.vehicle.id, { make: "Hijacked" })).status).toBe(404)
    expect((await del(theirs.vehicle.id)).status).toBe(404)
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: theirs.vehicle.id } })).make).toBe("Ford")
  })
})

describe("DELETE /api/vehicles/[id]", () => {
  it("deletes an unused vehicle but refuses one with bookings", async () => {
    const { user, vehicle } = await makeOwner(PREFIX)
    asOwner(user.id)
    expect((await del(vehicle.id)).status).toBe(200)

    const used = await makeOwner(PREFIX, "used")
    const { garage } = await makeGarage(PREFIX)
    await createBooking({ garageId: garage.id, source: "MARKETPLACE", ownerId: used.user.id, vehicleId: used.vehicle.id, serviceType: "MOT", scheduledAt: new Date(), totalPrice: 1, notify: false })
    asOwner(used.user.id)
    const res = await del(used.vehicle.id)
    expect(res.status).toBe(409)
    expect(await prisma.vehicle.count({ where: { id: used.vehicle.id } })).toBe(1)
  })
})
