import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { GET } from "./route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)

const PREFIX = "jobreqtest-"

async function makeFixtures() {
  const garageUser = await prisma.user.create({
    data: { email: `${PREFIX}garage@example.com`, role: "GARAGE", name: "Garage User" },
  })
  const owner = await prisma.user.create({
    data: { email: `${PREFIX}owner@example.com`, role: "OWNER", name: "Owner" },
  })
  const garage = await prisma.garage.create({
    data: {
      userId: garageUser.id,
      name: `${PREFIX}Garage`,
      slug: `${PREFIX}${Date.now()}`,
      phone: "0123456789",
      email: "garage@example.com",
      address: "1 Test St",
      city: "Testville",
      postcode: "ZZ9 1AA",
      status: "APPROVED",
      services: JSON.stringify(["MOT"]),
    },
  })
  const job = await prisma.jobRequest.create({
    data: {
      token: `${PREFIX}secret-token`,
      guestName: "Guest Person",
      guestEmail: `${PREFIX}guest@example.com`,
      guestPhone: "07123456789",
      registration: "AB12CDE",
      make: "Ford",
      model: "Focus",
      year: 2019,
      serviceType: "MOT",
      description: "Needs an MOT test please",
      city: "Testville",
      postcode: "ZZ9 1AB",
    },
  })
  return { garageUser, owner, garage, job }
}

async function cleanup() {
  await prisma.jobRequest.deleteMany({ where: { token: { startsWith: PREFIX } } })
  await prisma.garage.deleteMany({ where: { name: { startsWith: PREFIX } } })
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
}

describe("GET /api/job-requests (garage view)", () => {
  beforeEach(async () => {
    await cleanup()
    mockSession.mockReset()
  })
  afterAll(cleanup)

  it("never exposes the guest tracking token or email to a garage", async () => {
    const { garageUser, job } = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: garageUser.id, role: "GARAGE" } } as any)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    const mine = body.jobRequests.find((j: any) => j.id === job.id)

    expect(mine).toBeDefined()
    expect(mine.token).toBeUndefined()
    expect(mine.guestEmail).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain(`${PREFIX}secret-token`)
    // The garage still gets what it needs to follow up.
    expect(mine.guestName).toBe("Guest Person")
    expect(mine.guestPhone).toBe("07123456789")
    expect(mine.hasResponded).toBe(false)
  })

  it("rejects non-garage roles", async () => {
    const { owner } = await makeFixtures()
    mockSession.mockResolvedValue({ user: { id: owner.id, role: "OWNER" } } as any)
    expect((await GET()).status).toBe(403)
  })

  it("rejects anonymous callers", async () => {
    mockSession.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
  })
})
