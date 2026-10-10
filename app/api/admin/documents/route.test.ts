import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET, PATCH } from "./route"
import { cleanupPrefix, makeGarage } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "doctest-"
const asAdmin = () => mockSession.mockResolvedValue({ user: { id: "admin", role: "ADMIN", email: "admin@example.com" } } as any)
const decide = (documentId: string, decision: string, note?: string) =>
  PATCH(new Request("http://x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId, decision, note }) }))

beforeEach(async () => {
  mockSession.mockReset()
  asAdmin()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

const makeDoc = async (garageId: string, over: object = {}) =>
  prisma.garageDocument.create({ data: { garageId, kind: "INSURANCE", name: "policy.pdf", url: "https://blob.example.com/policy.pdf", ...over } })

describe("GET /api/admin/documents", () => {
  it("lists documents with their garage and per-status counts", async () => {
    const { garage } = await makeGarage(PREFIX)
    await makeDoc(garage.id)
    await makeDoc(garage.id, { status: "APPROVED" })
    const res = await GET(new Request("http://x/api/admin/documents?status=PENDING"))
    const body = await res.json()
    const mine = body.documents.filter((d: any) => d.garage.id === garage.id)
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({ kindLabel: "Public liability insurance", status: "PENDING", name: "policy.pdf" })
    expect(body.counts.PENDING).toBeGreaterThanOrEqual(1)
    expect(body.counts.APPROVED).toBeGreaterThanOrEqual(1)
  })

  it("is admin-only", async () => {
    mockSession.mockResolvedValue({ user: { id: "g", role: "GARAGE" } } as any)
    expect((await GET(new Request("http://x/api/admin/documents"))).status).toBe(401)
  })
})

describe("PATCH /api/admin/documents", () => {
  it("approving marks it reviewed, notifies the garage and writes the audit log", async () => {
    const { garage } = await makeGarage(PREFIX)
    const doc = await makeDoc(garage.id)
    expect((await decide(doc.id, "APPROVE")).status).toBe(200)
    expect(await prisma.garageDocument.findUniqueOrThrow({ where: { id: doc.id } })).toMatchObject({ status: "APPROVED", note: null })
    expect((await prisma.garageDocument.findUniqueOrThrow({ where: { id: doc.id } })).reviewedAt).not.toBeNull()
    expect(await prisma.notification.count({ where: { garageId: garage.id, title: "Document approved" } })).toBe(1)
    expect(await prisma.auditLog.count({ where: { targetId: doc.id, action: "DOCUMENT_APPROVED" } })).toBe(1)
  })

  it("rejecting must say why, and the reason reaches the garage", async () => {
    const { garage } = await makeGarage(PREFIX)
    const doc = await makeDoc(garage.id)
    expect((await decide(doc.id, "REJECT")).status).toBe(400)
    expect((await prisma.garageDocument.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe("PENDING")

    expect((await decide(doc.id, "REJECT", "Policy has expired")).status).toBe(200)
    expect(await prisma.garageDocument.findUniqueOrThrow({ where: { id: doc.id } })).toMatchObject({ status: "REJECTED", note: "Policy has expired" })
    const n = await prisma.notification.findFirstOrThrow({ where: { garageId: garage.id, title: "Document needs attention" } })
    expect(n.body).toContain("Policy has expired")
  })

  it("404s for an unknown document and is admin-only", async () => {
    expect((await decide("nope", "APPROVE")).status).toBe(404)
    mockSession.mockResolvedValue({ user: { id: "g", role: "GARAGE" } } as any)
    expect((await decide("nope", "APPROVE")).status).toBe(401)
  })
})

describe("garage documents are removed with their garage", () => {
  it("cascades on delete", async () => {
    const { garage } = await makeGarage(PREFIX)
    const doc = await makeDoc(garage.id)
    await cleanupPrefix(PREFIX)
    expect(await prisma.garageDocument.findUnique({ where: { id: doc.id } })).toBeNull()
  })
})
