import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET, POST } from "./route"
import { DELETE, GET as getOne, PATCH } from "./[id]/route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "arttest-"
const json = (method: string, body?: unknown) => new Request("http://x", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const draft = (over: object = {}) => ({ title: `${PREFIX}How to read an MOT advisory`, body: "An advisory is not a fail, but it is worth acting on soon.", status: "DRAFT", ...over })
const clean = () => prisma.article.deleteMany({ where: { slug: { startsWith: PREFIX } } })

// A real user, because an article records who wrote it.
let adminId = ""
beforeAll(async () => {
  adminId = (await prisma.user.create({ data: { email: `${PREFIX}admin-${Date.now()}@example.com`, role: "ADMIN" } })).id
})

beforeEach(async () => {
  mockSession.mockResolvedValue({ user: { id: adminId, role: "ADMIN" } } as any)
  await clean()
})
afterAll(async () => {
  await clean()
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
})

describe("/api/admin/articles", () => {
  it("creates a draft with a slug from the title and no publish date", async () => {
    const res = await POST(json("POST", draft()))
    expect(res.status).toBe(201)
    const { article } = await res.json()
    expect(article).toMatchObject({ slug: `${PREFIX}how-to-read-an-mot-advisory`, status: "DRAFT", publishedAt: null })
  })

  it("stamps the publish date on first publish and keeps it through unpublish/republish", async () => {
    const { article } = await (await POST(json("POST", draft({ status: "PUBLISHED" })))).json()
    expect(article.publishedAt).not.toBeNull()
    const first = new Date(article.publishedAt).getTime()

    await PATCH(json("PATCH", draft({ status: "DRAFT" })), ctx(article.id))
    expect((await prisma.article.findUniqueOrThrow({ where: { id: article.id } })).publishedAt?.getTime()).toBe(first)
    await PATCH(json("PATCH", draft({ status: "PUBLISHED" })), ctx(article.id))
    expect((await prisma.article.findUniqueOrThrow({ where: { id: article.id } })).publishedAt?.getTime()).toBe(first)
  })

  it("refuses a duplicate web address and bad input", async () => {
    await POST(json("POST", draft()))
    expect((await POST(json("POST", draft()))).status).toBe(409)
    expect((await POST(json("POST", draft({ title: "x" })))).status).toBe(400)
    expect((await POST(json("POST", draft({ slug: "Bad Slug" })))).status).toBe(400)
  })

  it("lists with counts and searches titles", async () => {
    await POST(json("POST", draft({ title: `${PREFIX}Brakes explained`, status: "PUBLISHED" })))
    await POST(json("POST", draft({ title: `${PREFIX}Tyre pressures` })))
    const all = await (await GET(new Request(`http://x/api/admin/articles?q=${PREFIX}`))).json()
    expect(all.articles.map((a: any) => a.title).sort()).toEqual([`${PREFIX}Brakes explained`, `${PREFIX}Tyre pressures`])
    const pub = await (await GET(new Request(`http://x/api/admin/articles?status=PUBLISHED&q=${PREFIX}`))).json()
    expect(pub.articles).toHaveLength(1)
    expect(pub.counts.ALL).toBeGreaterThanOrEqual(2)
  })

  it("reads, edits and deletes one article", async () => {
    const { article } = await (await POST(json("POST", draft()))).json()
    expect((await (await getOne(json("GET"), ctx(article.id))).json()).article.title).toBe(article.title)
    const edited = await (await PATCH(json("PATCH", draft({ title: `${PREFIX}Renamed guide`, slug: `${PREFIX}renamed` })), ctx(article.id))).json()
    expect(edited.article).toMatchObject({ title: `${PREFIX}Renamed guide`, slug: `${PREFIX}renamed` })
    expect((await DELETE(json("DELETE"), ctx(article.id))).status).toBe(200)
    expect((await DELETE(json("DELETE"), ctx(article.id))).status).toBe(404)
  })

  it("is admin-only", async () => {
    mockSession.mockResolvedValue({ user: { id: "g", role: "GARAGE" } } as any)
    expect((await POST(json("POST", draft()))).status).toBe(401)
    expect((await GET(new Request("http://x/api/admin/articles"))).status).toBe(401)
    expect((await getOne(json("GET"), ctx("x"))).status).toBe(401)
  })
})
