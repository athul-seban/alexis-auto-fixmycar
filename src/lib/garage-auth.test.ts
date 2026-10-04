import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { requireGarage, withGarage } from "@/lib/garage-auth"
import { BookingError } from "@/lib/portal/booking-error"
import { cleanupPrefix, makeGarage, makeOwner } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "garageauthtest-"
const asUser = (id: string, role = "GARAGE") => mockSession.mockResolvedValue({ user: { id, role } } as any)

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

const denied = async (opts?: { write?: boolean }) => {
  const r = await requireGarage(opts)
  if (r.ok) throw new Error("expected denial")
  return { status: r.response.status, body: await r.response.json() }
}

describe("requireGarage", () => {
  it("401 without a session", async () => {
    mockSession.mockResolvedValue(null)
    expect((await denied()).status).toBe(401)
  })

  it("403 for non-garage roles", async () => {
    const { user } = await makeOwner(PREFIX)
    asUser(user.id, "OWNER")
    expect((await denied()).status).toBe(403)
  })

  it("re-checks the DB: a stale GARAGE token for a demoted user is refused", async () => {
    const { user } = await makeOwner(PREFIX) // DB role is OWNER, token still says GARAGE
    asUser(user.id, "GARAGE")
    expect((await denied()).status).toBe(403)
  })

  it("403 for a suspended user account", async () => {
    const { user } = await makeGarage(PREFIX, { userSuspended: true })
    asUser(user.id)
    expect((await denied()).status).toBe(403)
  })

  it("404 NO_GARAGE when the garage user has no garage profile", async () => {
    const { prisma } = await import("@/lib/prisma")
    const user = await prisma.user.create({ data: { email: `${PREFIX}nogarage@example.com`, role: "GARAGE" } })
    asUser(user.id)
    const r = await denied()
    expect(r.status).toBe(404)
    expect(r.body.code).toBe("NO_GARAGE")
  })

  it("returns the user's garage", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    asUser(user.id)
    const r = await requireGarage()
    expect(r.ok && r.ctx.garage.id).toBe(garage.id)
  })

  it("allows a PENDING garage to read and write", async () => {
    const { user } = await makeGarage(PREFIX, { status: "PENDING" })
    asUser(user.id)
    expect((await requireGarage({ write: true })).ok).toBe(true)
  })

  it("lets a SUSPENDED garage read but not write", async () => {
    const { user } = await makeGarage(PREFIX, { status: "SUSPENDED" })
    asUser(user.id)
    expect((await requireGarage()).ok).toBe(true)
    const r = await denied({ write: true })
    expect(r.status).toBe(403)
    expect(r.body.code).toBe("GARAGE_SUSPENDED")
  })
})

describe("withGarage", () => {
  it("passes the garage context and awaited params to the handler", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    asUser(user.id)
    const handler = withGarage<{ id: string }>("test", async (_req, ctx, params) =>
      Response.json({ garageId: ctx.garage.id, id: params.id })
    )
    const res = await handler(new Request("http://localhost/x"), { params: Promise.resolve({ id: "abc" }) })
    expect(await res.json()).toEqual({ garageId: garage.id, id: "abc" })
  })

  it("short-circuits unauthenticated calls without running the handler", async () => {
    mockSession.mockResolvedValue(null)
    let ran = false
    const handler = withGarage("test", async () => {
      ran = true
      return Response.json({})
    })
    expect((await handler(new Request("http://localhost/x"))).status).toBe(401)
    expect(ran).toBe(false)
  })

  it("maps BookingError and unexpected errors to JSON responses", async () => {
    const { user } = await makeGarage(PREFIX)
    asUser(user.id)
    const typed = withGarage("test", async () => {
      throw new BookingError("OVERLAP", "Clash", { reason: "FULL" })
    })
    const r = await typed(new Request("http://localhost/x"))
    expect(r.status).toBe(409)
    expect(await r.json()).toEqual({ error: "Clash", code: "OVERLAP", reason: "FULL" })

    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const boom = withGarage("test", async () => {
      throw new Error("boom")
    })
    expect((await boom(new Request("http://localhost/x"))).status).toBe(500)
    spy.mockRestore()
  })

  it("enforces write protection for suspended garages when declared", async () => {
    const { user } = await makeGarage(PREFIX, { status: "SUSPENDED" })
    asUser(user.id)
    const handler = withGarage("test", async () => Response.json({ ok: true }), { write: true })
    expect((await handler(new Request("http://localhost/x", { method: "POST" }))).status).toBe(403)
  })
})
