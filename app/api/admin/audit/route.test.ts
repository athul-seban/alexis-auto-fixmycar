import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET } from "./route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const ACTOR = "auditlist-admin@example.com"
const get = (qs = "") => GET(new Request(`http://x/api/admin/audit?${qs}`))

const clean = () => prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR } })
beforeEach(async () => {
  mockSession.mockResolvedValue({ user: { id: "a", role: "ADMIN" } } as any)
  await clean()
  await prisma.auditLog.createMany({
    data: [
      { actorEmail: ACTOR, action: "GARAGE_APPROVED", targetType: "GARAGE", targetId: "g1", detail: "Acme Motors" },
      { actorEmail: ACTOR, action: "USER_DELETED", targetType: "USER", targetId: "u1", detail: "bob@example.com" },
      { actorEmail: ACTOR, action: "REVIEW_DELETED", targetType: "REVIEW", targetId: "r1", detail: "1★ review of Acme Motors" },
    ],
  })
})
afterAll(clean)

describe("GET /api/admin/audit", () => {
  it("lists newest first with per-type counts", async () => {
    const body = await (await get("pageSize=50")).json()
    const mine = body.entries.filter((e: any) => e.actor === ACTOR)
    expect(mine).toHaveLength(3)
    expect(body.counts.GARAGE).toBeGreaterThanOrEqual(1)
    expect(body.counts.ALL).toBeGreaterThanOrEqual(3)
  })

  it("filters by target type and searches detail text", async () => {
    const garages = await (await get(`target=GARAGE&q=${ACTOR}&pageSize=50`)).json()
    expect(garages.entries.map((e: any) => e.action)).toEqual(["GARAGE_APPROVED"])
    const search = await (await get(`q=acme&pageSize=50`)).json()
    expect(search.entries.filter((e: any) => e.actor === ACTOR)).toHaveLength(2)
  })

  it("rejects non-admins", async () => {
    mockSession.mockResolvedValue({ user: { id: "u", role: "OWNER" } } as any)
    expect((await get()).status).toBe(401)
  })
})
