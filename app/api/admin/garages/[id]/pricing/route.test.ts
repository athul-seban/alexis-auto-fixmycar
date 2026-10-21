import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET } from "./route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "admpricetest-"
const call = (id: string) => GET(new Request(`http://localhost/api/admin/garages/${id}/pricing`), { params: Promise.resolve({ id }) })

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
}

async function makeGarage() {
  const user = await prisma.user.create({
    data: {
      email: `${PREFIX}owner@example.com`,
      role: "GARAGE",
      garage: { create: { name: `${PREFIX}G`, slug: `${PREFIX}g`, phone: "", email: `${PREFIX}owner@example.com`, address: "", city: "Derby", postcode: "", services: JSON.stringify(["MOT", "FULL_SERVICE"]) } },
    },
    select: { garage: { select: { id: true } } },
  })
  const id = user.garage!.id
  await prisma.servicePrice.create({ data: { garageId: id, serviceType: "MOT", fixedPrice: 45 } })
  return id
}

beforeEach(cleanup)
afterAll(cleanup)

describe("GET /api/admin/garages/[id]/pricing", () => {
  it("shows an admin and a super admin the services the garage offers, with its prices", async () => {
    const id = await makeGarage()
    for (const role of ["ADMIN", "SUPER_ADMIN"]) {
      mockSession.mockResolvedValue({ user: { id: "x", role } } as never)
      const res = await call(id)
      expect(res.status).toBe(200)
      const { services } = await res.json()
      expect(services.map((s: { serviceType: string }) => s.serviceType).sort()).toEqual(["FULL_SERVICE", "MOT"])
      expect(services.find((s: { serviceType: string }) => s.serviceType === "MOT")).toMatchObject({ fixedPrice: 45, configured: true })
      expect(services.find((s: { serviceType: string }) => s.serviceType === "FULL_SERVICE")).toMatchObject({ fixedPrice: null, configured: false })
    }
  })

  it("is closed to everyone else", async () => {
    const id = await makeGarage()
    for (const session of [{ user: { id: "o", role: "OWNER" } }, { user: { id: "g", role: "GARAGE" } }, null]) {
      mockSession.mockResolvedValue(session as never)
      expect((await call(id)).status).toBe(401)
    }
  })

  it("404s an unknown garage", async () => {
    mockSession.mockResolvedValue({ user: { id: "x", role: "ADMIN" } } as never)
    expect((await call("nope")).status).toBe(404)
  })
})
