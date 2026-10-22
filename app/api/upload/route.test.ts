import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { del, put } from "@vercel/blob"
import { prisma } from "@/lib/prisma"
import { cleanupPrefix, makeGarage, makeOwner } from "@/test/fixtures"
import { DELETE, POST } from "./route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@vercel/blob", () => ({ put: vi.fn(), del: vi.fn() }))

const mockSession = vi.mocked(getServerSession)
const mockPut = vi.mocked(put)
const mockDel = vi.mocked(del)
const PREFIX = "uploadtest-"
const BLOB_HOST = "https://store.public.blob.vercel-storage.com"

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]
const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]
const text = (s: string) => Array.from(new TextEncoder().encode(s))

function upload(bytes: number[], opts: { name?: string; type?: string; kind?: string } = {}) {
  const form = new FormData()
  form.set("file", new File([new Uint8Array(bytes)], opts.name ?? "photo.png", { type: opts.type ?? "image/png" }))
  if (opts.kind) form.set("kind", opts.kind)
  return POST(new Request("http://localhost/api/upload", { method: "POST", body: form }))
}
const remove = (url: string) => DELETE(new Request(`http://localhost/api/upload?url=${encodeURIComponent(url)}`, { method: "DELETE" }))

let garageId: string
let userId: string
const asGarage = () => mockSession.mockResolvedValue({ user: { id: userId, role: "GARAGE" } } as never)

beforeEach(async () => {
  process.env.BLOB_READ_WRITE_TOKEN = "test-token"
  mockSession.mockReset()
  mockPut.mockReset()
  mockDel.mockReset()
  mockPut.mockImplementation(async (pathname: string) => ({ url: `${BLOB_HOST}/${pathname}`, pathname }) as never)
  mockDel.mockResolvedValue(undefined as never)
  await cleanupPrefix(PREFIX)
  await prisma.rateLimitHit.deleteMany({ where: { key: { startsWith: "garage-upload:" } } })
  const g = await makeGarage(PREFIX)
  garageId = g.garage.id
  userId = g.user.id
  asGarage()
})
afterAll(async () => {
  await cleanupPrefix(PREFIX)
  await prisma.rateLimitHit.deleteMany({ where: { key: { startsWith: "garage-upload:" } } })
})

describe("POST /api/upload: who may upload", () => {
  it("refuses signed-out visitors, revoked sessions and non-garage accounts", async () => {
    mockSession.mockResolvedValue(null as never)
    expect((await upload(PNG)).status).toBe(401)
    mockSession.mockResolvedValue({ user: { id: undefined, role: undefined } } as never)
    expect((await upload(PNG)).status).toBe(401)
    const owner = await makeOwner(PREFIX)
    mockSession.mockResolvedValue({ user: { id: owner.user.id, role: "OWNER" } } as never)
    expect((await upload(PNG)).status).toBe(403)
    expect(mockPut).not.toHaveBeenCalled()
  })
})

describe("POST /api/upload: file validation", () => {
  it("accepts a real PNG and names the stored file from its sniffed type", async () => {
    const res = await upload(PNG, { kind: "gallery" })
    expect(res.status).toBe(201)
    const [pathname, , options] = mockPut.mock.calls[0] as [string, unknown, { contentType: string; access: string }]
    expect(pathname).toMatch(new RegExp(`^garages/${garageId}/gallery-\\d+\\.png$`))
    expect(options).toMatchObject({ contentType: "image/png", access: "public" })
    expect(JSON.parse((await prisma.garage.findUniqueOrThrow({ where: { id: garageId } })).images)).toHaveLength(1)
  })

  it("ignores the client's file name and declared type: bytes decide (regression)", async () => {
    // A JPEG called evil.html and declared as image/png is stored as a .jpg served as image/jpeg.
    expect((await upload(JPG, { name: "evil.html", type: "image/png" })).status).toBe(201)
    const [pathname, , options] = mockPut.mock.calls[0] as [string, unknown, { contentType: string }]
    expect(pathname.endsWith(".jpg")).toBe(true)
    expect(pathname).not.toContain("html")
    expect(options.contentType).toBe("image/jpeg")
  })

  it("rejects HTML, SVG and scripts that claim to be images", async () => {
    for (const body of ["<html><script>alert(1)</script></html>", '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>', "GIF89a....."]) {
      expect((await upload(text(body), { name: "x.png", type: "image/png" })).status).toBe(400)
    }
    expect(mockPut).not.toHaveBeenCalled()
  })

  it("rejects a file over 5 MB before reading it", async () => {
    const big = new Array(5 * 1024 * 1024 + 1).fill(0)
    big.splice(0, PNG.length, ...PNG)
    expect((await upload(big)).status).toBe(400)
    expect(mockPut).not.toHaveBeenCalled()
  })

  it("rejects a missing file", async () => {
    const res = await POST(new Request("http://localhost/api/upload", { method: "POST", body: new FormData() }))
    expect(res.status).toBe(400)
  })

  it("stops at 8 gallery images", async () => {
    const urls = Array.from({ length: 8 }, (_, i) => `${BLOB_HOST}/garages/${garageId}/gallery-${i}.png`)
    await prisma.garage.update({ where: { id: garageId }, data: { images: JSON.stringify(urls) } })
    expect((await upload(PNG)).status).toBe(400)
    expect((await upload(PNG, { kind: "logo" })).status).toBe(201) // the logo isn't part of the gallery
  })

  it("limits uploads per garage per hour", async () => {
    await prisma.rateLimitHit.createMany({ data: Array.from({ length: 40 }, () => ({ key: `garage-upload:key:${garageId}` })) })
    const res = await upload(PNG)
    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).not.toBeNull()
    expect(mockPut).not.toHaveBeenCalled()
  })
})

describe("POST /api/upload: replacing a logo", () => {
  it("deletes the old logo from storage when it is ours", async () => {
    const old = `${BLOB_HOST}/garages/${garageId}/logo-old.png`
    await prisma.garage.update({ where: { id: garageId }, data: { logo: old } })
    expect((await upload(PNG, { kind: "logo" })).status).toBe(201)
    expect(mockDel).toHaveBeenCalledWith(old)
  })

  it("never deletes a logo URL that isn't in this garage's folder", async () => {
    await prisma.garage.update({ where: { id: garageId }, data: { logo: "https://elsewhere.example/their-logo.png" } })
    await upload(PNG, { kind: "logo" })
    await prisma.garage.update({ where: { id: garageId }, data: { logo: `${BLOB_HOST}/garages/someone-else/logo.png` } })
    await upload(PNG, { kind: "logo" })
    expect(mockDel).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/upload", () => {
  it("removes an image from the gallery and deletes its file", async () => {
    const mine = `${BLOB_HOST}/garages/${garageId}/gallery-1.png`
    const keep = `${BLOB_HOST}/garages/${garageId}/gallery-2.png`
    await prisma.garage.update({ where: { id: garageId }, data: { images: JSON.stringify([mine, keep]) } })

    expect((await remove(mine)).status).toBe(200)
    expect(JSON.parse((await prisma.garage.findUniqueOrThrow({ where: { id: garageId } })).images)).toEqual([keep])
    expect(mockDel).toHaveBeenCalledWith(mine)
  })

  it("404s a URL that isn't in the gallery and deletes nothing (can't be aimed at someone else's file)", async () => {
    const other = `${BLOB_HOST}/garages/another-garage/gallery-1.png`
    expect((await remove(other)).status).toBe(404)
    expect((await remove("https://evil.example/x.png")).status).toBe(404)
    expect(mockDel).not.toHaveBeenCalled()
  })

  it("requires url and a garage account", async () => {
    expect((await DELETE(new Request("http://localhost/api/upload", { method: "DELETE" }))).status).toBe(400)
    mockSession.mockResolvedValue(null as never)
    expect((await remove("x")).status).toBe(401)
  })
})
