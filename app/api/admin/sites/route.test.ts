import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { cleanupPrefix, makeGarage } from "@/test/fixtures"
import { ensureSite, requestPublish, setAddress } from "@/lib/site/site-service"
import { GET, POST } from "./route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue({ success: true }) }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "admsites-"
const asAdmin = (role = "ADMIN") => mockSession.mockResolvedValue({ user: { id: "adm-1", email: "boss-sites@example.com", role } } as never)
const post = (body: unknown) => POST(new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
const list = async (qs = "") => (await GET(new Request(`http://x/api/admin/sites?q=${PREFIX}&pageSize=50${qs}`))).json()

async function wipe() {
  const orgs = await prisma.organisation.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } })
  await prisma.auditLog.deleteMany({ where: { OR: [{ organisationId: { in: orgs.map((o) => o.id) } }, { actorEmail: "boss-sites@example.com" }] } })
  await cleanupPrefix(PREFIX)
}
beforeEach(async () => {
  asAdmin()
  await wipe()
})
afterAll(wipe)

async function pendingSite(key = "shop") {
  const biz = await makeGarage(PREFIX, { key })
  const org = biz.organisation!
  const ctx = { organisation: org, actor: { id: biz.user.id, email: biz.user.email } }
  await ensureSite(org.id, org.name)
  await setAddress(ctx, `${PREFIX}${key}-${Math.random().toString(36).slice(2, 7)}`)
  await requestPublish(ctx)
  const site = await prisma.organisationSite.findUniqueOrThrow({ where: { organisationId: org.id } })
  return { ...biz, org, ctx, site }
}

describe("admin site approvals", () => {
  it("lists what is waiting, with the business, address, owner and counts", async () => {
    const s = await pendingSite()
    const body = await list()
    const row = body.sites.find((x: { id: string }) => x.id === s.site.id)
    expect(row).toMatchObject({ businessName: s.org.name, status: "PENDING_REVIEW", locations: 1, liveLocations: 1, ownerEmail: s.user.email, disabled: false })
    expect(row.label).toMatch(new RegExp(`^${PREFIX}shop-`))
    expect(body.counts.PENDING_REVIEW).toBeGreaterThanOrEqual(1)
    expect(await list("&status=PUBLISHED")).toMatchObject({ sites: [] })
  })

  it("approves, and then shows it under Published", async () => {
    const s = await pendingSite()
    const res = await post({ siteId: s.site.id, action: "approve" })
    expect(res.status).toBe(200)
    expect((await res.json()).site).toMatchObject({ status: "PUBLISHED" })
    expect((await list("&status=PUBLISHED")).sites.map((x: { id: string }) => x.id)).toContain(s.site.id)
  })

  it("sends back with a required reason, and the business is told", async () => {
    const s = await pendingSite()
    expect((await post({ siteId: s.site.id, action: "reject" })).status).toBe(400)
    expect((await post({ siteId: s.site.id, action: "reject", reason: "no" })).status).toBe(400)
    const res = await post({ siteId: s.site.id, action: "reject", reason: "Please describe your services" })
    expect(res.status).toBe(200)
    expect((await prisma.organisationSite.findUniqueOrThrow({ where: { id: s.site.id } })).rejectionReason).toBe("Please describe your services")
    expect(await prisma.notification.count({ where: { garageId: s.garage.id, title: "Your website needs changes" } })).toBe(1)
  })

  it("switches a site off and on, with a reason", async () => {
    const s = await pendingSite()
    await post({ siteId: s.site.id, action: "approve" })
    expect((await post({ siteId: s.site.id, action: "disable" })).status).toBe(400)
    expect((await post({ siteId: s.site.id, action: "disable", reason: "Misleading claims" })).status).toBe(200)
    expect((await list("&status=PUBLISHED")).sites.find((x: { id: string }) => x.id === s.site.id)).toMatchObject({ disabled: true, disabledReason: "Misleading claims" })
    expect((await post({ siteId: s.site.id, action: "enable" })).status).toBe(200)
  })

  it("explains refusals: not waiting, can't go live, unknown site", async () => {
    const s = await pendingSite()
    await prisma.garage.update({ where: { id: s.garage.id }, data: { status: "SUSPENDED" } })
    const notReady = await post({ siteId: s.site.id, action: "approve" })
    expect(notReady.status).toBe(409)
    expect((await notReady.json()).code).toBe("NOT_READY")
    expect((await post({ siteId: s.site.id, action: "enable" })).status).toBe(409)
    expect((await post({ siteId: "nope", action: "approve" })).status).toBe(404)
    expect((await post({ siteId: s.site.id, action: "teleport" })).status).toBe(400)
  })

  it("records each decision in the business's own trail and the platform's", async () => {
    const s = await pendingSite()
    await post({ siteId: s.site.id, action: "approve" })
    const rows = await prisma.auditLog.findMany({ where: { organisationId: s.org.id, targetType: "SITE" }, orderBy: { createdAt: "asc" } })
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(["SITE_SUBMITTED", "SITE_APPROVED"]))
    expect(rows.find((r) => r.action === "SITE_APPROVED")).toMatchObject({ actorEmail: "boss-sites@example.com" })
  })

  it("is for admins only (a super admin too); not owners, garages or visitors", async () => {
    const s = await pendingSite()
    asAdmin("SUPER_ADMIN")
    expect((await post({ siteId: s.site.id, action: "approve" })).status).toBe(200)
    for (const role of ["OWNER", "GARAGE"]) {
      mockSession.mockResolvedValue({ user: { id: "x", role } } as never)
      expect((await GET(new Request("http://x"))).status, role).toBe(401)
      expect((await post({ siteId: s.site.id, action: "disable", reason: "nope nope" })).status, role).toBe(401)
    }
    mockSession.mockResolvedValue(null as never)
    expect((await GET(new Request("http://x"))).status).toBe(401)
    expect((await prisma.organisationSite.findUniqueOrThrow({ where: { id: s.site.id } })).disabledAt).toBeNull()
  })
})
