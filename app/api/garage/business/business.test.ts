import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { cleanupPrefix, makeGarage, makeLocation, makeStaff } from "@/test/fixtures"
import { GET as businessGet, PATCH as businessPatch } from "./route"
import { GET as auditGet } from "../audit/route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "bizdetails-"
const as = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE", email: `${id}@example.com` } } as never)
const patch = (body: unknown) => businessPatch(new Request("http://x/api/garage/business", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
const get = () => businessGet(new Request("http://x/api/garage/business"))
const audit = (qs = "") => auditGet(new Request(`http://x/api/garage/audit${qs}`))

/** Trail entries are filed under the business, so find them through the businesses this file made. */
async function wipe() {
  const orgs = await prisma.organisation.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } })
  await prisma.auditLog.deleteMany({ where: { organisationId: { in: orgs.map((o) => o.id) } } })
  await cleanupPrefix(PREFIX)
}

beforeEach(async () => {
  mockSession.mockReset()
  await wipe()
})
afterEach(() => vi.unstubAllEnvs())
afterAll(wipe)

async function setup() {
  const biz = await makeGarage(PREFIX, { key: "main" })
  const second = await makeLocation(PREFIX, biz.organisation!.id, { key: "second" })
  as(biz.user.id)
  return { ...biz, second }
}

describe("business details", () => {
  it("shows the business, counting only its working locations", async () => {
    const s = await setup()
    await makeLocation(PREFIX, s.organisation!.id, { key: "closed", status: "ARCHIVED" })
    const body = await (await get()).json()
    expect(body.business).toMatchObject({ id: s.organisation!.id, name: s.organisation!.name, locationCount: 2 })
  })

  it("updates the details, tidies the numbers, and records which fields changed (not their values)", async () => {
    const s = await setup()
    const res = await patch({ name: `${PREFIX}Renamed Ltd`, legalName: "Renamed Motors Limited", contactPhone: "01904 123456", website: "https://example.com", description: "  Family run.  " })
    expect(res.status).toBe(200)
    expect((await res.json()).business).toMatchObject({ name: `${PREFIX}Renamed Ltd`, legalName: "Renamed Motors Limited", website: "https://example.com", description: "Family run." })
    const row = await prisma.organisation.findUniqueOrThrow({ where: { id: s.organisation!.id } })
    expect(row.contactPhone).toMatch(/^0\d/)

    const log = await prisma.auditLog.findFirstOrThrow({ where: { organisationId: s.organisation!.id, action: "BUSINESS_UPDATED" } })
    expect(log.detail).toContain("name")
    expect(log.detail).not.toContain("Renamed Motors") // values stay out of the trail
  })

  it("changing the VAT number changes it on every location, so invoices agree", async () => {
    const s = await setup()
    expect((await patch({ vatNumber: "gb123456789" })).status).toBe(200)
    expect((await prisma.organisation.findUniqueOrThrow({ where: { id: s.organisation!.id } })).vatNumber).toBe("GB123456789")
    for (const id of [s.garage.id, s.second.id]) expect((await prisma.garage.findUniqueOrThrow({ where: { id } })).vatNumber).toBe("GB123456789")
    // Clearing it clears it everywhere.
    expect((await patch({ vatNumber: null })).status).toBe(200)
    for (const id of [s.garage.id, s.second.id]) expect((await prisma.garage.findUniqueOrThrow({ where: { id } })).vatNumber).toBeNull()
  })

  it("rejects bad input and leaves the business unchanged", async () => {
    const s = await setup()
    for (const bad of [{ name: "x" }, { vatNumber: "12" }, { contactEmail: "nope" }, { contactPhone: "12" }, { website: "javascript:alert(1)" }, {}]) {
      expect((await patch(bad)).status, JSON.stringify(bad)).toBe(400)
    }
    expect((await prisma.organisation.findUniqueOrThrow({ where: { id: s.organisation!.id } })).name).toBe(s.organisation!.name)
  })

  it("is for the owner: not a manager, not a location-only role, and hidden while the feature is off", async () => {
    const s = await setup()
    const manager = await makeStaff(PREFIX, s.organisation!.id, { role: "manager" })
    as(manager.user.id)
    expect((await get()).status).toBe(403)
    expect((await patch({ name: `${PREFIX}Hijack` })).status).toBe(403)

    const everywhere = await makeStaff(PREFIX, s.organisation!.id, { key: "ops", permissions: ["organisation.edit"] })
    as(everywhere.user.id)
    expect((await get()).status).toBe(200)
    const oneBranch = await makeStaff(PREFIX, s.organisation!.id, { key: "branch", permissions: ["organisation.edit"], locations: [s.second.id] })
    as(oneBranch.user.id)
    expect((await get()).status).toBe(403) // a business-wide key counts only when held at every location

    as(s.user.id)
    vi.stubEnv("ORG_FEATURES", "locations")
    expect((await get()).status).toBe(404)
  })

  it("is refused for a garage that hasn't been set up as a business", async () => {
    const legacy = await makeGarage(PREFIX, { key: "legacy", legacy: true })
    as(legacy.user.id)
    expect((await get()).status).toBe(409)
  })
})

describe("the activity log", () => {
  it("lists the business's own trail, newest first, with readable labels", async () => {
    const s = await setup()
    await patch({ name: `${PREFIX}One` })
    await patch({ name: `${PREFIX}Two` })
    const body = await (await audit()).json()
    expect(body.total).toBeGreaterThanOrEqual(2)
    expect(body.entries[0]).toMatchObject({ action: "BUSINESS_UPDATED", label: "Updated the business details", by: `${s.user.id}@example.com` })
    expect(new Date(body.entries[0].at).getTime()).toBeGreaterThanOrEqual(new Date(body.entries[1].at).getTime())
  })

  it("never shows another business's entries or platform admin actions", async () => {
    const s = await setup()
    const rival = await makeGarage(PREFIX, { key: "rival" })
    await prisma.auditLog.create({ data: { action: "STAFF_INVITED", targetType: "MEMBER", targetId: "x", organisationId: rival.organisation!.id, actorEmail: "rival@example.com" } })
    await prisma.auditLog.create({ data: { action: "GARAGE_APPROVED", targetType: "GARAGE", targetId: s.garage.id, actorEmail: "admin@example.com" } })
    const body = await (await audit()).json()
    expect(JSON.stringify(body.entries)).not.toContain("rival@example.com")
    expect(body.entries.map((e: { action: string }) => e.action)).not.toContain("GARAGE_APPROVED")
    await prisma.auditLog.deleteMany({ where: { OR: [{ organisationId: rival.organisation!.id }, { targetId: s.garage.id, action: "GARAGE_APPROVED" }] } })
  })

  it("pages through a long trail", async () => {
    const s = await setup()
    await prisma.auditLog.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ action: "ROLE_CREATED", targetType: "ROLE", targetId: `r${i}`, organisationId: s.organisation!.id, actorEmail: "x@example.com" })) })
    const first = await (await audit("?page=1")).json()
    const second = await (await audit("?page=2")).json()
    expect(first.entries).toHaveLength(25)
    expect(second.entries.length).toBeGreaterThanOrEqual(5)
    expect(first.totalPages).toBeGreaterThanOrEqual(2)
    expect(new Set([...first.entries, ...second.entries].map((e: { id: string }) => e.id)).size).toBe(first.entries.length + second.entries.length)
  })

  it("needs audit.view at every location", async () => {
    const s = await setup()
    const manager = await makeStaff(PREFIX, s.organisation!.id, { role: "manager" })
    as(manager.user.id)
    expect((await audit()).status).toBe(403)
    const auditor = await makeStaff(PREFIX, s.organisation!.id, { key: "aud", permissions: ["audit.view"] })
    as(auditor.user.id)
    expect((await audit()).status).toBe(200)
  })
})
