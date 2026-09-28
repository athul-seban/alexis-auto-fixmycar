import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { GET, POST } from "./route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/notifications", () => ({
  notifyGarage: vi.fn().mockResolvedValue(undefined),
  notifyUser: vi.fn().mockResolvedValue(undefined),
}))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "quoteroletest-"

async function makeFixtures() {
  const owner = await prisma.user.create({ data: { email: `${PREFIX}owner@example.com`, role: "OWNER" } })
  const garageUser = await prisma.user.create({ data: { email: `${PREFIX}garage@example.com`, role: "GARAGE" } })
  const otherGarageUser = await prisma.user.create({ data: { email: `${PREFIX}other-garage@example.com`, role: "GARAGE" } })
  const garage = await prisma.garage.create({
    data: {
      userId: garageUser.id,
      name: `${PREFIX}Garage`,
      slug: `${PREFIX}${Date.now()}`,
      phone: "0123456789",
      email: "g@example.com",
      address: "1 St",
      city: "Bristol",
      postcode: "BS1 1AA",
      status: "APPROVED",
    },
  })
  const otherGarage = await prisma.garage.create({
    data: {
      userId: otherGarageUser.id,
      name: `${PREFIX}OtherGarage`,
      slug: `${PREFIX}other-${Date.now()}`,
      phone: "0123456789",
      email: "og@example.com",
      address: "2 St",
      city: "Bristol",
      postcode: "BS1 1AB",
      status: "APPROVED",
    },
  })
  const vehicle = await prisma.vehicle.create({
    data: { ownerId: owner.id, registration: `${PREFIX}REG`, make: "Ford", model: "Focus", year: 2020 },
  })
  const quote = await prisma.quote.create({
    data: {
      ownerId: owner.id,
      vehicleId: vehicle.id,
      garageId: garage.id,
      serviceType: "MOT",
      description: "Needs an MOT",
      status: "PENDING",
    },
  })
  return { owner, garageUser, otherGarageUser, garage, otherGarage, vehicle, quote }
}

async function cleanup() {
  await prisma.quote.deleteMany({ where: { description: "Needs an MOT" } })
  await prisma.vehicle.deleteMany({ where: { registration: `${PREFIX}REG` } })
  await prisma.garage.deleteMany({ where: { name: { startsWith: PREFIX } } })
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function getRequest() {
  return new Request("http://localhost/api/quotes")
}

describe("Quotes route — cross-role permission checks", () => {
  beforeEach(cleanup)
  afterAll(cleanup)

  it("rejects a GARAGE-role user attempting to request a quote (owner-only action)", async () => {
    const { garageUser, garage, vehicle } = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: garageUser.id, role: "GARAGE" } } as any)

    const res = await POST(
      postRequest({ action: "request", vehicleId: vehicle.id, garageId: garage.id, serviceType: "MOT", description: "Needs MOT please" })
    )
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBe("Invalid action")
  })

  it("rejects an OWNER attempting to respond to a quote (garage-only action)", async () => {
    const { owner, quote } = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: owner.id, role: "OWNER" } } as any)

    const res = await POST(postRequest({ action: "respond", quoteId: quote.id, price: 100 }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBe("Invalid action")
  })

  it("returns 404 when a garage tries to respond to a quote belonging to a different garage", async () => {
    const { otherGarageUser, quote } = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: otherGarageUser.id, role: "GARAGE" } } as any)

    const res = await POST(postRequest({ action: "respond", quoteId: quote.id, price: 100 }))
    expect(res.status).toBe(404)
  })

  it("allows the owning garage to respond to its own quote", async () => {
    const { garageUser, quote } = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: garageUser.id, role: "GARAGE" } } as any)

    const res = await POST(postRequest({ action: "respond", quoteId: quote.id, price: 100 }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.quote.status).toBe("SENT")
  })

  it("GET only returns quotes scoped to the requesting owner, not all owners' quotes", async () => {
    const { owner, quote } = await makeFixtures()
    const otherOwner = await prisma.user.create({ data: { email: `${PREFIX}other-owner@example.com`, role: "OWNER" } })
    mockSession.mockResolvedValue({ user: { id: otherOwner.id, role: "OWNER" } } as any)

    const res = await GET(getRequest())
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.quotes.find((q: any) => q.id === quote.id)).toBeUndefined()
  })

  it("rejects an unauthenticated GET request", async () => {
    mockSession.mockResolvedValue(null)
    const res = await GET(getRequest())
    expect(res.status).toBe(401)
  })

  it("rejects an ADMIN role on GET since it's neither OWNER nor GARAGE here", async () => {
    mockSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } } as any)
    const res = await GET(getRequest())
    expect(res.status).toBe(403)
  })
})
