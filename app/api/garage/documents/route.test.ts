import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { del, put } from "@vercel/blob"
import { prisma } from "@/lib/prisma"
import { cleanupPrefix, makeGarage } from "@/test/fixtures"
import { DELETE, GET, POST } from "./route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@vercel/blob", () => ({ put: vi.fn(), del: vi.fn(), get: vi.fn() }))

const mockSession = vi.mocked(getServerSession)
const mockPut = vi.mocked(put)
const mockDel = vi.mocked(del)
const PREFIX = "doctest-"

const PDF = Array.from(new TextEncoder().encode("%PDF-1.7\n1 0 obj\n"))
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]
const text = (s: string) => Array.from(new TextEncoder().encode(s))

function upload(bytes: number[], opts: { name?: string; type?: string; kind?: string } = {}) {
  const form = new FormData()
  form.set("file", new File([new Uint8Array(bytes)], opts.name ?? "cert.pdf", { type: opts.type ?? "application/pdf" }))
  form.set("kind", opts.kind ?? "INSURANCE")
  return POST(new Request("http://localhost/api/garage/documents", { method: "POST", body: form }))
}

let garageId: string
const asGarage = (userId: string) => mockSession.mockResolvedValue({ user: { id: userId, role: "GARAGE" } } as never)

beforeEach(async () => {
  process.env.BLOB_READ_WRITE_TOKEN = "test-token"
  mockSession.mockReset()
  mockPut.mockReset()
  mockDel.mockReset()
  mockPut.mockImplementation(async (pathname: string) => ({ url: `https://store.private.blob.vercel-storage.com/${pathname}`, pathname }) as never)
  mockDel.mockResolvedValue(undefined as never)
  await cleanupPrefix(PREFIX)
  await prisma.rateLimitHit.deleteMany({ where: { key: { startsWith: "garage-document:" } } })
  const g = await makeGarage(PREFIX)
  garageId = g.garage.id
  asGarage(g.user.id)
})
afterAll(async () => {
  await cleanupPrefix(PREFIX)
  await prisma.rateLimitHit.deleteMany({ where: { key: { startsWith: "garage-document:" } } })
})

describe("POST /api/garage/documents", () => {
  it("stores a real PDF as a private blob and records it", async () => {
    const res = await upload(PDF, { name: "../../Insurance 2026.pdf" })
    expect(res.status).toBe(201)
    const [pathname, , options] = mockPut.mock.calls[0] as [string, unknown, { access: string; contentType: string }]
    expect(pathname).toMatch(new RegExp(`^garage-documents/${garageId}/insurance\\.pdf$`))
    expect(options).toMatchObject({ access: "private", contentType: "application/pdf" })
    const doc = (await res.json()).document
    expect(doc.name).toBe("Insurance 2026.pdf") // path parts stripped
    expect(doc).not.toHaveProperty("url") // the private URL is never sent to the browser
  })

  it("takes the stored type from the bytes, not the declared type or file name (regression)", async () => {
    // a PNG uploaded as "application/pdf" is stored as a png
    expect((await upload(PNG, { name: "scan.pdf", type: "application/pdf" })).status).toBe(201)
    const [pathname, , options] = mockPut.mock.calls[0] as [string, unknown, { contentType: string }]
    expect(pathname.endsWith(".png")).toBe(true)
    expect(options.contentType).toBe("image/png")
  })

  it("rejects HTML, scripts and office files that claim to be PDFs", async () => {
    for (const body of ["<html><script>alert(1)</script></html>", "MZ\u0090\u0000 not a pdf", "PK\u0003\u0004docx"]) {
      expect((await upload(text(body), { name: "x.pdf", type: "application/pdf" })).status).toBe(400)
    }
    expect(mockPut).not.toHaveBeenCalled()
    expect(await prisma.garageDocument.count({ where: { garageId } })).toBe(0)
  })

  it("rejects an unknown kind and a missing file", async () => {
    expect((await upload(PDF, { kind: "PASSPORT" })).status).toBe(400)
    const form = new FormData()
    form.set("kind", "INSURANCE")
    expect((await POST(new Request("http://localhost/x", { method: "POST", body: form }))).status).toBe(400)
  })

  it("limits uploads per garage per hour", async () => {
    await prisma.rateLimitHit.createMany({ data: Array.from({ length: 20 }, () => ({ key: `garage-document:key:${garageId}` })) })
    expect((await upload(PDF)).status).toBe(429)
    expect(mockPut).not.toHaveBeenCalled()
  })

  it("refuses non-garage and signed-out callers", async () => {
    mockSession.mockResolvedValue(null as never)
    expect((await upload(PDF)).status).toBe(401)
  })
})

describe("GET and DELETE /api/garage/documents", () => {
  it("lists only this garage's documents", async () => {
    await upload(PDF)
    const other = await makeGarage(PREFIX, { key: "other" })
    await prisma.garageDocument.create({ data: { garageId: other.garage.id, kind: "ID", name: "theirs.pdf", url: "https://x/private" } })
    const body = await (await GET(new Request("http://localhost/api/garage/documents"))).json()
    expect(body.documents.map((d: { name: string }) => d.name)).toEqual(["cert.pdf"])
  })

  it("deletes the row and the stored file", async () => {
    const doc = (await (await upload(PDF)).json()).document
    const stored = await prisma.garageDocument.findUniqueOrThrow({ where: { id: doc.id } })
    const res = await DELETE(new Request(`http://localhost/api/garage/documents?id=${doc.id}`, { method: "DELETE" }))
    expect(res.status).toBe(200)
    expect(await prisma.garageDocument.count({ where: { id: doc.id } })).toBe(0)
    expect(mockDel).toHaveBeenCalledWith(stored.url)
  })

  it("won't delete another garage's document (404, file untouched)", async () => {
    const other = await makeGarage(PREFIX, { key: "other2" })
    const theirs = await prisma.garageDocument.create({ data: { garageId: other.garage.id, kind: "ID", name: "theirs.pdf", url: "https://x/private" } })
    const res = await DELETE(new Request(`http://localhost/api/garage/documents?id=${theirs.id}`, { method: "DELETE" }))
    expect(res.status).toBe(404)
    expect(await prisma.garageDocument.count({ where: { id: theirs.id } })).toBe(1)
    expect(mockDel).not.toHaveBeenCalled()
  })
})
