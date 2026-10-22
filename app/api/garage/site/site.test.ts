import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { del, put } from "@vercel/blob"
import { prisma } from "@/lib/prisma"
import { cleanupPrefix, makeGarage, makeLocation, makeStaff } from "@/test/fixtures"
import { GET as siteGet, PATCH as sitePatch } from "./route"
import { GET as addressGet, PUT as addressPut } from "./address/route"
import { POST as publishPost } from "./publish/route"
import { POST as uploadPost } from "./upload/route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue({ success: true }) }))
vi.mock("@vercel/blob", () => ({ put: vi.fn(), del: vi.fn() }))

const mockSession = vi.mocked(getServerSession)
const mockPut = vi.mocked(put)
const mockDel = vi.mocked(del)
const PREFIX = "siteapi-"
const BLOB = "https://store.public.blob.vercel-storage.com"
const as = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE", email: `${id}@example.com` } } as never)
const json = (method: string, body: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const req = (path: string, init?: RequestInit) => new Request(`http://x/api/garage/site${path}`, init)

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]
const upload = (bytes: number[], kind = "logo", name = "logo.png") => {
  const form = new FormData()
  form.set("file", new File([new Uint8Array(bytes)], name, { type: "image/png" }))
  form.set("kind", kind)
  return uploadPost(req("/upload", { method: "POST", body: form }))
}

async function wipe() {
  await prisma.rateLimitHit.deleteMany({ where: { key: { startsWith: "site-" } } })
  const orgs = await prisma.organisation.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } })
  await prisma.auditLog.deleteMany({ where: { organisationId: { in: orgs.map((o) => o.id) } } })
  await cleanupPrefix(PREFIX)
}

beforeEach(async () => {
  mockSession.mockReset()
  process.env.BLOB_READ_WRITE_TOKEN = "test-token"
  mockPut.mockReset()
  mockDel.mockReset()
  mockPut.mockImplementation(async (pathname: string) => ({ url: `${BLOB}/${pathname}`, pathname }) as never)
  mockDel.mockResolvedValue(undefined as never)
  await wipe()
})
afterEach(() => vi.unstubAllEnvs())
afterAll(wipe)

async function setup() {
  const biz = await makeGarage(PREFIX, { key: "shop" })
  as(biz.user.id)
  return biz
}
const state = async () => (await siteGet(req(""))).json()

describe("who may edit the website", () => {
  it("the owner can; a manager can't (the website is the whole business's, not a branch's)", async () => {
    const s = await setup()
    expect((await siteGet(req(""))).status).toBe(200)
    const manager = await makeStaff(PREFIX, s.organisation!.id, { role: "manager" })
    as(manager.user.id)
    expect((await siteGet(req(""))).status).toBe(403)
    expect((await sitePatch(req("", json("PATCH", { expectedVersion: 1, theme: { brand: "#112233", accent: "#445566", font: "sans", radius: "md" } })))).status).toBe(403)
  })

  it("a role with website.edit works only when held at every location", async () => {
    const s = await setup()
    const second = await makeLocation(PREFIX, s.organisation!.id)
    const everywhere = await makeStaff(PREFIX, s.organisation!.id, { key: "web", permissions: ["website.edit"] })
    as(everywhere.user.id)
    expect((await siteGet(req(""))).status).toBe(200)
    const oneBranch = await makeStaff(PREFIX, s.organisation!.id, { key: "branch", permissions: ["website.edit"], locations: [second.id] })
    as(oneBranch.user.id)
    expect((await siteGet(req(""))).status).toBe(403)
  })

  it("is hidden while the feature is off, and for signed-out visitors", async () => {
    await setup()
    vi.stubEnv("ORG_FEATURES", "staff")
    expect((await siteGet(req(""))).status).toBe(404)
    expect((await addressGet(req("/address?label=x"))).status).toBe(404)
    vi.unstubAllEnvs()
    mockSession.mockResolvedValue(null as never)
    expect((await siteGet(req(""))).status).toBe(401)
  })

  it("refuses a garage that hasn't been set up as a business", async () => {
    const legacy = await makeGarage(PREFIX, { key: "legacy", legacy: true })
    as(legacy.user.id)
    expect((await siteGet(req(""))).status).toBe(409)
  })
})

describe("the editor", () => {
  it("returns the draft, the address, the locations and what is stopping it going live", async () => {
    const s = await setup()
    const body = await state()
    expect(body.site).toMatchObject({ status: "DRAFT", version: 1, approved: false })
    expect(body.content.hero.headline).toBe(s.organisation!.name.slice(0, 90))
    expect(body.locations.map((l: { id: string }) => l.id)).toEqual([s.garage.id])
    expect(body.address.label).toMatch(/^siteapi-shop-/)
    expect(body.problems).toEqual([])
  })

  it("saves edits and refuses a stale save with 409 STALE", async () => {
    await setup()
    const body = await state()
    const theme = { ...body.theme, brand: "#123456" }
    const ok = await sitePatch(req("", json("PATCH", { expectedVersion: body.site.version, theme })))
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ version: 2 })
    const stale = await sitePatch(req("", json("PATCH", { expectedVersion: body.site.version, theme: { ...theme, brand: "#654321" } })))
    expect(stale.status).toBe(409)
    expect((await stale.json()).code).toBe("STALE")
    expect((await state()).theme.brand).toBe("#123456")
  })

  it("rejects bad input: unknown fields, long text, bad colours, links to other sites' images", async () => {
    const s = await setup()
    const body = await state()
    const v = body.site.version
    const patch = (b: object) => sitePatch(req("", json("PATCH", { expectedVersion: v, ...b })))
    expect((await patch({})).status).toBe(400)
    expect((await patch({ theme: { ...body.theme, brand: "red" } })).status).toBe(400)
    expect((await patch({ theme: { ...body.theme, font: "Comic Sans" } })).status).toBe(400)
    expect((await patch({ content: { ...body.content, hero: { ...body.content.hero, headline: "x".repeat(200) } } })).status).toBe(400)
    expect((await patch({ content: { ...body.content, social: { ...body.content.social, facebook: "http://insecure.example" } } })).status).toBe(400)
    const foreign = await patch({ content: { ...body.content, hero: { ...body.content.hero, imageUrl: "https://evil.example.com/x.jpg" } } })
    expect(foreign.status).toBe(400)
    expect((await foreign.json()).error).toMatch(/uploaded here/)
    expect((await patch({ logo: `${BLOB}/orgs/someone-else/logo.png` })).status).toBe(400)
    expect((await state()).site.version).toBe(v) // nothing changed
    expect(s.organisation).toBeTruthy()
  })
})

describe("the address", () => {
  it("checks availability, and saves a valid address", async () => {
    await setup()
    const label = `${PREFIX}mine-${Math.random().toString(36).slice(2, 7)}`
    expect(await (await addressGet(req(`/address?label=${label}`))).json()).toMatchObject({ ok: true, label })
    expect(await (await addressGet(req("/address?label=admin"))).json()).toMatchObject({ ok: false })

    const res = await addressPut(req("/address", json("PUT", { label: label.toUpperCase() })))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ label })
    expect((await state()).address.label).toBe(label)
  })

  it("refuses reserved and taken addresses with the reason", async () => {
    await setup()
    const taken = (await state()).address.label
    const other = await makeGarage(PREFIX, { key: "other" })
    as(other.user.id)
    const clash = await addressPut(req("/address", json("PUT", { label: taken })))
    expect(clash.status).toBe(409)
    const reserved = await addressPut(req("/address", json("PUT", { label: "billing" })))
    expect(reserved.status).toBe(400)
    expect((await reserved.json()).error).toMatch(/reserved/)
    expect((await addressPut(req("/address", json("PUT", {})))).status).toBe(400)
  })
})

describe("publishing", () => {
  it("sends the first publish for review, and says what's missing when it can't", async () => {
    const s = await setup()
    const res = await publishPost(req("/publish", json("POST", { action: "publish" })))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "PENDING_REVIEW" })
    expect((await state()).site.status).toBe("PENDING_REVIEW")

    const withdraw = await publishPost(req("/publish", json("POST", { action: "withdraw" })))
    expect(withdraw.status).toBe(200)

    await prisma.garage.update({ where: { id: s.garage.id }, data: { status: "PENDING" } })
    const notReady = await publishPost(req("/publish", json("POST", { action: "publish" })))
    expect(notReady.status).toBe(409)
    const body = await notReady.json()
    expect(body.code).toBe("NOT_READY")
    expect(body.problems.join(" ")).toMatch(/live/)
  })

  it("refuses unknown actions and unpublishing a site that isn't live", async () => {
    await setup()
    expect((await publishPost(req("/publish", json("POST", { action: "explode" })))).status).toBe(400)
    expect((await publishPost(req("/publish", json("POST", { action: "unpublish" })))).status).toBe(409)
    expect((await publishPost(req("/publish", json("POST", { action: "rollback", revisionId: "nope" })))).status).toBe(409) // not published yet
  })
})

describe("uploads", () => {
  it("stores a real image under the business's own folder and saves the logo, removing the old one", async () => {
    const s = await setup()
    const first = await upload(PNG)
    expect(first.status).toBe(201)
    const url = (await first.json()).url as string
    expect(url).toContain(`/orgs/${s.organisation!.id}/logo-`)
    expect((await state()).site.logo).toBe(url)

    const second = await upload(PNG)
    expect(second.status).toBe(201)
    expect(mockDel).toHaveBeenCalledWith(url)
    expect(mockPut.mock.calls[1][2]).toMatchObject({ access: "public", contentType: "image/png" })
  })

  it("keeps a hero or gallery photo out of the site until the draft is saved with it", async () => {
    const s = await setup()
    const res = await upload(PNG, "hero")
    expect(res.status).toBe(201)
    expect((await res.json()).url).toContain(`/orgs/${s.organisation!.id}/hero-`)
    expect((await state()).site.logo).toBeNull()
    expect(mockDel).not.toHaveBeenCalled()
  })

  it("trusts the bytes, not the name or claimed type: scripts, SVG and HTML are refused", async () => {
    await setup()
    const text = (s: string) => Array.from(new TextEncoder().encode(s))
    expect((await upload(text("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"), "logo", "logo.png")).status).toBe(400)
    expect((await upload(text("<html><script>alert(1)</script></html>"), "logo", "logo.png")).status).toBe(400)
    expect(mockPut).not.toHaveBeenCalled()
  })

  it("limits the size, and says so when storage isn't configured", async () => {
    await setup()
    expect((await upload([...PNG, ...new Array(2 * 1024 * 1024).fill(0)])).status).toBe(400)
    delete process.env.BLOB_READ_WRITE_TOKEN
    expect((await upload(PNG)).status).toBe(503)
  })

  it("needs the website permission", async () => {
    const s = await setup()
    const manager = await makeStaff(PREFIX, s.organisation!.id, { role: "manager" })
    as(manager.user.id)
    expect((await upload(PNG)).status).toBe(403)
    expect(mockPut).not.toHaveBeenCalled()
  })
})
