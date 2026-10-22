import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import bcrypt from "bcryptjs"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { requireGarage } from "@/lib/garage-auth"
import { POST } from "./route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const PREFIX = "regtest-"
const email = (n: string) => `${PREFIX}${n}@example.com`
const post = (body: unknown) => POST(new Request("http://localhost/api/garages/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
const valid = (n: string, over: Record<string, unknown> = {}) => ({
  name: "Sam Owner",
  email: email(n),
  password: "a-long-garage-passphrase",
  phone: "07700 900123",
  garageName: `${PREFIX}Garage ${n}`,
  garagePhone: "020 7946 0958",
  garageEmail: email(`${n}-garage`),
  address: "1 High Street",
  city: "Derby",
  postcode: "de1 1aa",
  isMobile: false,
  services: ["MOT", "FULL_SERVICE"],
  ...over,
})

async function cleanup() {
  await prisma.garage.deleteMany({ where: { name: { startsWith: PREFIX } } }) // a garage outlives its login (SetNull)
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
  await prisma.organisation.deleteMany({ where: { name: { startsWith: PREFIX } } })
}
beforeEach(cleanup)
afterAll(cleanup)

describe("POST /api/garages/register", () => {
  it("creates the owner, a pending first location, and the business around it", async () => {
    const res = await post(valid("a"))
    expect(res.status).toBe(201)
    const { user } = await res.json()

    const owner = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { garage: { include: { organisation: { include: { roles: true } } } }, memberships: { include: { assignments: true } } } })
    expect(owner.role).toBe("GARAGE")
    expect(await bcrypt.compare("a-long-garage-passphrase", owner.password!)).toBe(true)
    expect(owner.garage).toMatchObject({ status: "PENDING", city: "Derby", postcode: "DE1 1AA", name: `${PREFIX}Garage a` })

    const org = owner.garage!.organisation!
    expect(org.name).toBe(`${PREFIX}Garage a`)
    expect(org.roles.map((r) => r.presetKey).sort()).toEqual(["manager", "owner", "staff"])
    expect(owner.memberships).toHaveLength(1)
    expect(owner.memberships[0].organisationId).toBe(org.id)
    expect(owner.memberships[0].assignments).toMatchObject([{ scopeKey: "*", garageId: null, roleId: org.roles.find((r) => r.presetKey === "owner")!.id }])
    expect(JSON.stringify(await prisma.garage.findUniqueOrThrow({ where: { id: owner.garage!.id } }))).toContain("DE1 1AA")
  })

  it("the new owner can immediately use the portal as Owner", async () => {
    const { user } = await (await post(valid("b"))).json()
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: user.id, role: "GARAGE" } } as never)
    const r = await requireGarage({ permission: "billing.manage" })
    expect(r.ok && r.ctx.access.isOwner).toBe(true)
    expect(r.ok && r.ctx.legacy).toBe(false)
  })

  it("is all-or-nothing: a failure leaves no half-created business behind", async () => {
    // A garage with this slug already exists, but a different email is registering: the unique slug loop picks a new one,
    // so force a real failure instead (duplicate user email) and check nothing else was written.
    await post(valid("c"))
    const before = { users: await prisma.user.count({ where: { email: { startsWith: PREFIX } } }), orgs: await prisma.organisation.count({ where: { name: { startsWith: PREFIX } } }) }
    const dup = await post(valid("c", { garageName: `${PREFIX}Another Garage` }))
    expect(dup.status).toBe(409)
    expect(await prisma.user.count({ where: { email: { startsWith: PREFIX } } })).toBe(before.users)
    expect(await prisma.organisation.count({ where: { name: { startsWith: PREFIX } } })).toBe(before.orgs)
  })

  it("gives garages with the same name different slugs and separate businesses", async () => {
    await post(valid("d1", { garageName: `${PREFIX}Same Name` }))
    await post(valid("d2", { garageName: `${PREFIX}Same Name` }))
    const garages = await prisma.garage.findMany({ where: { name: `${PREFIX}Same Name` }, include: { organisation: true } })
    expect(garages).toHaveLength(2)
    expect(new Set(garages.map((g) => g.slug)).size).toBe(2)
    expect(new Set(garages.map((g) => g.organisationId)).size).toBe(2)
    expect(new Set(garages.map((g) => g.organisation!.slug)).size).toBe(2)
  })

  it("refuses an email that is already registered", async () => {
    await prisma.user.create({ data: { email: email("e"), role: "OWNER" } })
    expect((await post(valid("e"))).status).toBe(409)
  })

  it("validates the form", async () => {
    for (const bad of [{ password: "short" }, { password: "password123" }, { phone: "12345" }, { garagePhone: "x" }, { email: "nope" }, { garageName: "" }, { services: [] }, { services: ["NOT_A_SERVICE"] }, { vatNumber: "123" }, { postcode: "x" }]) {
      expect((await post(valid("f", bad))).status, JSON.stringify(bad)).toBe(400)
    }
    expect(await prisma.user.count({ where: { email: { startsWith: `${PREFIX}f` } } })).toBe(0)
  })
})
