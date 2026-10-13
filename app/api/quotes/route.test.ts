import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { GET, POST } from "./route"
import { sendMail } from "@/lib/mail"
import { notifyUser } from "@/lib/notifications"
import { expireDueRequests } from "@/lib/portal/quote-request-service"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue({ success: true }) }))
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
      services: JSON.stringify(["MOT", "BRAKES"]),
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
      services: JSON.stringify(["MOT", "BRAKES"]),
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
  await prisma.quote.deleteMany({ where: { OR: [{ description: "Needs an MOT" }, { description: { startsWith: "Timed:" } }] } })
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

  it("lets an owner request a quote for their own vehicle", async () => {
    const { owner, garage, vehicle } = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: owner.id, role: "OWNER" } } as any)
    const res = await POST(postRequest({ action: "request", vehicleId: vehicle.id, garageId: garage.id, serviceType: "MOT", description: "Needs an MOT" }))
    expect(res.status).toBe(201)
    // The garage hears about it by email.
    expect(vi.mocked(sendMail).mock.calls.at(-1)![0].to).toBe("g@example.com")
  })

  it("refuses a vehicle that belongs to someone else, a garage that isn't live, and an unknown service", async () => {
    const { owner, garage, otherGarage, vehicle } = await makeFixtures()
    const stranger = await prisma.user.create({ data: { email: `${PREFIX}stranger@example.com`, role: "OWNER" } })
    const body = (over: object) => postRequest({ action: "request", vehicleId: vehicle.id, garageId: garage.id, serviceType: "MOT", description: "Needs an MOT", ...over })

    mockSession.mockResolvedValue({ user: { id: stranger.id, role: "OWNER" } } as any)
    expect((await POST(body({}))).status).toBe(404)

    mockSession.mockResolvedValue({ user: { id: owner.id, role: "OWNER" } } as any)
    await prisma.garage.update({ where: { id: otherGarage.id }, data: { status: "PENDING" } })
    expect((await POST(body({ garageId: otherGarage.id }))).status).toBe(404)
    expect((await POST(body({ serviceType: "TELEPORTING" }))).status).toBe(400)
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
    // The owner is emailed the price.
    const sent = vi.mocked(sendMail).mock.calls.at(-1)![0]
    expect(sent.to).toBe(`${PREFIX}owner@example.com`)
    expect(sent.subject).toContain("£100.00")
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

describe("Quotes route: several works, instant prices and deadlines", () => {
  beforeEach(cleanup)
  afterAll(cleanup)

  const request = (garageId: string, vehicleId: string, over: object = {}) =>
    POST(postRequest({ action: "request", vehicleId, garageId, services: ["MOT", "BRAKES"], description: "Timed: MOT and brakes", ...over }))

  it("sends an instant quote when every work has an automatic price", async () => {
    const { owner, garage, vehicle } = await makeFixtures()
    await prisma.servicePrice.create({ data: { garageId: garage.id, serviceType: "MOT", fixedPrice: 40, autoQuote: true } })
    await prisma.servicePrice.create({ data: { garageId: garage.id, serviceType: "BRAKES", fixedPrice: 110, autoQuote: true } })
    mockSession.mockResolvedValue({ user: { id: owner.id, role: "OWNER" } } as any)

    const res = await request(garage.id, vehicle.id)
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.instantlyQuoted).toBe(true)
    expect(data.quote).toMatchObject({ status: "SENT", price: 150, source: "AUTO" })
  })

  it("waits for the garage within its deadline, and takes an amount for every work", async () => {
    const { owner, garageUser, garage, vehicle } = await makeFixtures()
    await prisma.garage.update({ where: { id: garage.id }, data: { portalSettings: JSON.stringify({ quotes: { responseHours: 2 } }) } })
    mockSession.mockResolvedValue({ user: { id: owner.id, role: "OWNER" } } as any)

    const created = (await (await request(garage.id, vehicle.id)).json()).quote
    expect(created.status).toBe("PENDING")
    expect(new Date(created.respondBy).getTime()).toBeLessThanOrEqual(Date.now() + 2 * 3_600_000 + 1000)

    mockSession.mockResolvedValue({ user: { id: garageUser.id, role: "GARAGE" } } as any)
    const respond = (body: object) => POST(postRequest({ action: "respond", quoteId: created.id, ...body }))
    expect((await respond({ items: [{ serviceType: "MOT", price: 40 }] })).status).toBe(400) // BRAKES missing
    const ok = await respond({ items: [{ serviceType: "MOT", price: 40 }, { serviceType: "BRAKES", price: 99 }] })
    expect(ok.status).toBe(200)
    expect((await ok.json()).quote).toMatchObject({ status: "SENT", price: 139, source: "MANUAL" })
  })

  it("never shows a garage the customer's name, phone or registration before they accept", async () => {
    const { owner, garageUser, garage, vehicle } = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: owner.id, role: "OWNER" } } as any)
    await request(garage.id, vehicle.id)

    mockSession.mockResolvedValue({ user: { id: garageUser.id, role: "GARAGE" } } as any)
    const text = JSON.stringify(await (await GET(getRequest())).json())
    expect(text).not.toContain(`${PREFIX}REG`)
    expect(text).not.toContain(`${PREFIX}owner@example.com`)
    expect(text).not.toContain('"phone"')
    expect(text).not.toContain('"owner"')
  })

  it("closes an unanswered request once the garage's deadline has passed", async () => {
    const { owner, garage, vehicle } = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: owner.id, role: "OWNER" } } as any)
    const created = (await (await request(garage.id, vehicle.id)).json()).quote
    await prisma.quote.update({ where: { id: created.id }, data: { respondBy: new Date(Date.now() - 1000) } })

    expect(await expireDueRequests({ ownerId: owner.id })).toBe(1)
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: created.id } })).status).toBe("EXPIRED")
    expect(vi.mocked(notifyUser)).toHaveBeenCalledWith(expect.objectContaining({ userId: owner.id, type: "QUOTE_EXPIRED" }))
    expect(await expireDueRequests({ ownerId: owner.id })).toBe(0)
  })
})
