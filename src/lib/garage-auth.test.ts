import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { forbidden, requireGarage, withGarage } from "@/lib/garage-auth"
import { BookingError } from "@/lib/portal/booking-error"
import { cleanupPrefix, makeGarage, makeLocation, makeOwner, makeStaff } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "garageauthtest-"
const asUser = (id: string, role = "GARAGE") => mockSession.mockResolvedValue({ user: { id, role } } as any)
const reqAt = (locationId?: string) => new Request("http://localhost/x", { headers: locationId ? { "x-qmg-location": locationId } : {} })

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

const denied = async (opts?: Parameters<typeof requireGarage>[0], req?: Request) => {
  const r = await requireGarage(opts, req)
  if (r.ok) throw new Error("expected denial")
  return { status: r.response.status, body: await r.response.json() }
}

describe("requireGarage: who is let in", () => {
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
    const user = await prisma.user.create({ data: { email: `${PREFIX}nogarage@example.com`, role: "GARAGE" } })
    asUser(user.id)
    const r = await denied()
    expect(r.status).toBe(404)
    expect(r.body.code).toBe("NO_GARAGE")
  })

  it("returns the owner's garage, business and full access", async () => {
    const { user, garage, organisation } = await makeGarage(PREFIX)
    asUser(user.id)
    const r = await requireGarage()
    expect(r.ok && r.ctx.garage.id).toBe(garage.id)
    expect(r.ok && r.ctx.organisation?.id).toBe(organisation!.id)
    expect(r.ok && r.ctx.access.isOwner).toBe(true)
    expect(r.ok && r.ctx.legacy).toBe(false)
    expect(r.ok && r.ctx.can("billing.manage")).toBe(true)
    expect(r.ok && r.ctx.locations.map((l) => l.id)).toEqual([garage.id])
  })

  it("still lets a garage that predates businesses in, as its own owner (legacy path)", async () => {
    const { user, garage } = await makeGarage(PREFIX, { legacy: true })
    asUser(user.id)
    const r = await requireGarage({ permission: "billing.manage" })
    expect(r.ok && r.ctx.garage.id).toBe(garage.id)
    expect(r.ok && r.ctx.organisation).toBeNull()
    expect(r.ok && r.ctx.legacy).toBe(true)
    expect(r.ok && r.ctx.can("pricing.edit")).toBe(true)
  })

  it("403 NO_ACCESS for the original login of a garage whose business no longer lists them", async () => {
    const { user, membership } = await makeGarage(PREFIX)
    await prisma.membership.delete({ where: { id: membership!.id } })
    asUser(user.id)
    const r = await denied()
    expect(r.status).toBe(403)
    expect(r.body.code).toBe("NO_ACCESS")
  })

  it("403 NO_ACCESS for a suspended member, and for every member of a suspended business", async () => {
    const { organisation } = await makeGarage(PREFIX)
    const member = await makeStaff(PREFIX, organisation!.id, { status: "SUSPENDED" })
    asUser(member.user.id)
    expect((await denied()).body.code).toBe("NO_ACCESS")

    const live = await makeStaff(PREFIX, organisation!.id, { key: "live" })
    asUser(live.user.id)
    expect((await requireGarage()).ok).toBe(true)
    await prisma.organisation.update({ where: { id: organisation!.id }, data: { suspendedAt: new Date() } })
    expect((await denied()).body.code).toBe("NO_ACCESS")
  })
})

describe("requireGarage: location rules", () => {
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

  it("acts on the location named in the x-qmg-location header when the user may open it", async () => {
    const { user, garage, organisation } = await makeGarage(PREFIX)
    const second = await makeLocation(PREFIX, organisation!.id, { key: "second" })
    asUser(user.id)
    expect((await requireGarage({}, reqAt())) as any).toMatchObject({ ok: true, ctx: { garage: { id: garage.id } } }) // default: the login's own
    const r = await requireGarage({}, reqAt(second.id))
    expect(r.ok && r.ctx.garage.id).toBe(second.id)
    expect(r.ok && r.ctx.locations.map((l) => l.id).sort()).toEqual([garage.id, second.id].sort())
  })

  it("ignores a requested location from another business (can't be used to read someone else's garage)", async () => {
    const mine = await makeGarage(PREFIX, { key: "mine" })
    const theirs = await makeGarage(PREFIX, { key: "theirs" })
    asUser(mine.user.id)
    const r = await requireGarage({}, reqAt(theirs.garage.id))
    expect(r.ok && r.ctx.garage.id).toBe(mine.garage.id)
  })

  it("ignores a requested location a staff member isn't assigned to", async () => {
    const { garage, organisation } = await makeGarage(PREFIX)
    const york = await makeLocation(PREFIX, organisation!.id, { key: "york" })
    const staff = await makeStaff(PREFIX, organisation!.id, { role: "manager", locations: [york.id] })
    asUser(staff.user.id)
    const r = await requireGarage({}, reqAt(garage.id))
    expect(r.ok && r.ctx.garage.id).toBe(york.id)
    expect(r.ok && r.ctx.locations.map((l) => l.id)).toEqual([york.id])
  })

  it("junk in the location header falls back to the default instead of failing", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    asUser(user.id)
    for (const junk of ["", "x", "../../etc/passwd", "a".repeat(200), "garage id with spaces"]) {
      const r = await requireGarage({}, new Request("http://localhost/x", { headers: { "x-qmg-location": junk } }))
      expect(r.ok && r.ctx.garage.id, junk).toBe(garage.id)
    }
  })

  it("write protection follows the ACTIVE location: one location suspended, the other fine", async () => {
    const { user, organisation } = await makeGarage(PREFIX)
    const suspended = await makeLocation(PREFIX, organisation!.id, { key: "sus", status: "SUSPENDED" })
    asUser(user.id)
    expect((await requireGarage({ write: true }, reqAt())).ok).toBe(true)
    expect((await denied({ write: true }, reqAt(suspended.id))).body.code).toBe("GARAGE_SUSPENDED")
  })
})

describe("requireGarage: permissions", () => {
  it("a Staff member can do staff things but not manager things (403 FORBIDDEN)", async () => {
    const { organisation } = await makeGarage(PREFIX)
    const staff = await makeStaff(PREFIX, organisation!.id, { role: "staff" })
    asUser(staff.user.id)
    expect((await requireGarage({ permission: "bookings.manage" })).ok).toBe(true)
    const r = await denied({ permission: "pricing.edit" })
    expect(r.status).toBe(403)
    expect(r.body.code).toBe("FORBIDDEN")
    expect((await denied({ permission: "billing.view" })).body.code).toBe("FORBIDDEN")
  })

  it("supports any-of and member requirements", async () => {
    const { organisation } = await makeGarage(PREFIX)
    const staff = await makeStaff(PREFIX, organisation!.id, { role: "staff" })
    asUser(staff.user.id)
    expect((await requireGarage({ permission: { anyOf: ["pricing.edit", "messages.reply"] } })).ok).toBe(true)
    expect((await denied({ permission: { anyOf: ["pricing.edit", "invoices.issue"] } })).status).toBe(403)
    expect((await requireGarage({ permission: "member" })).ok).toBe(true)
  })

  it("a Manager at one location has no business-wide permissions, even if the role lists them", async () => {
    const { garage, organisation } = await makeGarage(PREFIX)
    const mgr = await makeStaff(PREFIX, organisation!.id, { permissions: ["bookings.manage", "billing.manage", "roles.manage"], locations: [garage.id] })
    asUser(mgr.user.id)
    expect((await requireGarage({ permission: "bookings.manage" })).ok).toBe(true)
    expect((await denied({ permission: "billing.manage" })).status).toBe(403)
    expect((await denied({ permission: "roles.manage" })).status).toBe(403)
  })

  it("permission changes apply on the very next request (no stale token)", async () => {
    const { organisation } = await makeGarage(PREFIX)
    const staff = await makeStaff(PREFIX, organisation!.id, { permissions: ["pricing.view"] })
    asUser(staff.user.id)
    expect((await denied({ permission: "pricing.edit" })).status).toBe(403)
    await prisma.role.update({ where: { id: staff.role.id }, data: { permissions: JSON.stringify(["pricing.view", "pricing.edit"]) } })
    expect((await requireGarage({ permission: "pricing.edit" })).ok).toBe(true)
    await prisma.role.update({ where: { id: staff.role.id }, data: { isEnabled: false } })
    expect((await denied({ permission: "pricing.view" })).status).toBe(403)
  })

  it("checks permission before the suspended-location write block", async () => {
    const { organisation } = await makeGarage(PREFIX, { status: "SUSPENDED" })
    const staff = await makeStaff(PREFIX, organisation!.id, { role: "staff" })
    asUser(staff.user.id)
    expect((await denied({ permission: "pricing.edit", write: true })).body.code).toBe("FORBIDDEN")
  })
})

describe("withGarage", () => {
  it("passes the garage context and awaited params to the handler", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    asUser(user.id)
    const handler = withGarage<{ id: string }>(
      "test",
      async (_req, ctx, params) => Response.json({ garageId: ctx.garage.id, id: params.id }),
      { permission: "member" }
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
    }, { permission: "member" })
    expect((await handler(new Request("http://localhost/x"))).status).toBe(401)
    expect(ran).toBe(false)
  })

  it("does not run the handler when the permission is missing", async () => {
    const { organisation } = await makeGarage(PREFIX)
    const staff = await makeStaff(PREFIX, organisation!.id, { role: "staff" })
    asUser(staff.user.id)
    let ran = false
    const handler = withGarage("test", async () => {
      ran = true
      return Response.json({})
    }, { permission: "billing.manage" })
    const res = await handler(new Request("http://localhost/x"))
    expect(res.status).toBe(403)
    expect(ran).toBe(false)
  })

  it("gives the handler a can() for checks that depend on the request", async () => {
    const { organisation } = await makeGarage(PREFIX)
    const staff = await makeStaff(PREFIX, organisation!.id, { role: "staff" })
    asUser(staff.user.id)
    const handler = withGarage("test", async (_req, ctx) => Response.json({ export: ctx.can("bookings.export"), view: ctx.can("bookings.view") }), { permission: "bookings.view" })
    expect(await (await handler(new Request("http://localhost/x"))).json()).toEqual({ export: false, view: true })
    expect((forbidden()).status).toBe(403)
  })

  it("maps BookingError and unexpected errors to JSON responses", async () => {
    const { user } = await makeGarage(PREFIX)
    asUser(user.id)
    const typed = withGarage("test", async () => {
      throw new BookingError("OVERLAP", "Clash", { reason: "FULL" })
    }, { permission: "member" })
    const r = await typed(new Request("http://localhost/x"))
    expect(r.status).toBe(409)
    expect(await r.json()).toEqual({ error: "Clash", code: "OVERLAP", reason: "FULL" })

    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const boom = withGarage("test", async () => {
      throw new Error("boom")
    }, { permission: "member" })
    expect((await boom(new Request("http://localhost/x"))).status).toBe(500)
    spy.mockRestore()
  })

  it("enforces write protection for suspended garages when declared", async () => {
    const { user } = await makeGarage(PREFIX, { status: "SUSPENDED" })
    asUser(user.id)
    const handler = withGarage("test", async () => Response.json({ ok: true }), { permission: "member", write: true })
    expect((await handler(new Request("http://localhost/x", { method: "POST" }))).status).toBe(403)
  })
})
