import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { cleanupPrefix, makeGarage, makeLocation, makeStaff } from "@/test/fixtures"
import { PRESET_ROLES } from "@/lib/org/presets"
import { MAX_ROLES_PER_BUSINESS } from "@/lib/org/rules"
import { GET, POST } from "./route"
import { DELETE, PATCH } from "./[id]/route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "rolestest-"
const as = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE", email: `${id}@example.com` } } as never)
const json = (method: string, body?: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
const list = async () => (await (await GET(new Request("http://x/api/garage/roles"))).json()) as { roles: { id: string; name: string; presetKey: string | null; isEnabled: boolean; permissions: string[]; members: number; edited: boolean }[]; library: { key: string }[]; limit: number }
const create = (body: unknown) => POST(new Request("http://x/api/garage/roles", json("POST", body)))
const patch = (id: string, body: unknown) => PATCH(new Request("http://x", json("PATCH", body)), { params: Promise.resolve({ id }) })
const del = (id: string) => DELETE(new Request("http://x", json("DELETE")), { params: Promise.resolve({ id }) })

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterEach(() => vi.unstubAllEnvs())
afterAll(() => cleanupPrefix(PREFIX))

async function setup() {
  const biz = await makeGarage(PREFIX)
  as(biz.user.id)
  return biz
}

describe("GET /api/garage/roles", () => {
  it("shows the built-in roles, how many people hold each, and the library of presets to switch on", async () => {
    const { organisation } = await setup()
    await makeStaff(PREFIX, organisation!.id, { role: "staff" })
    const { roles, library, limit } = await list()
    expect(roles.map((r) => r.presetKey)).toEqual(["owner", "manager", "staff"])
    expect(roles.find((r) => r.presetKey === "owner")).toMatchObject({ members: 1, isEnabled: true })
    expect(roles.find((r) => r.presetKey === "staff")?.members).toBe(1)
    expect(library).toHaveLength(PRESET_ROLES.length)
    expect(library.map((p) => p.key)).toContain("receptionist")
    expect(limit).toBe(MAX_ROLES_PER_BUSINESS)
  })

  it("is open to people who manage staff (they need to see what they can assign) but not to ordinary staff", async () => {
    const { organisation, garage } = await setup()
    const mgr = await makeStaff(PREFIX, organisation!.id, { key: "mgr", role: "manager", locations: [garage.id] })
    const staff = await makeStaff(PREFIX, organisation!.id, { key: "stf", role: "staff" })
    as(mgr.user.id)
    expect((await GET(new Request("http://x"))).status).toBe(200)
    as(staff.user.id)
    expect((await GET(new Request("http://x"))).status).toBe(403)
  })

  it("never shows another business's roles", async () => {
    const a = await setup()
    const b = await makeGarage(PREFIX, { key: "other" })
    await prisma.role.create({ data: { organisationId: b.organisation!.id, name: "Their secret role", permissions: "[]" } })
    as(a.user.id)
    expect((await list()).roles.map((r) => r.name)).not.toContain("Their secret role")
  })
})

describe("switching on a preset", () => {
  it("copies the preset in, enabled, and removes it from the library", async () => {
    const { organisation } = await setup()
    const res = await create({ presetKey: "receptionist" })
    expect(res.status).toBe(201)
    const { role } = await res.json()
    expect(role).toMatchObject({ name: "Receptionist", presetKey: "receptionist", isEnabled: true, isSystem: false, edited: false })
    expect(role.permissions).toEqual(expect.arrayContaining(["bookings.manage", "diary.manage", "messages.reply"]))
    expect((await list()).library.map((p) => p.key)).not.toContain("receptionist")

    expect((await create({ presetKey: "receptionist" })).status).toBe(409)
    expect((await create({ presetKey: "not_a_role" })).status).toBe(404)
    const entry = await prisma.auditLog.findFirst({ where: { action: "ROLE_ENABLED", organisationId: organisation!.id } })
    expect(entry).toMatchObject({ targetType: "ROLE", targetId: role.id })
  })

  it("every preset in the library can be switched on", async () => {
    await setup()
    for (const p of PRESET_ROLES) expect((await create({ presetKey: p.key })).status, p.key).toBe(201)
    expect((await list()).library).toHaveLength(0)
  })
})

describe("custom roles", () => {
  it("creates one with the permissions chosen, expanded with what they imply", async () => {
    await setup()
    const res = await create({ name: "Front desk", description: "Books people in", permissions: ["bookings.manage", "messages.reply"] })
    expect(res.status).toBe(201)
    const { role } = await res.json()
    expect(role).toMatchObject({ name: "Front desk", presetKey: null, isSystem: false })
    expect(role.permissions).toEqual(["bookings.view", "bookings.manage", "bookings.viewOwn", "bookings.updateOwn", "messages.view", "messages.reply"])
  })

  it("validates the name and the permissions", async () => {
    await setup()
    await create({ name: "Front desk", permissions: ["bookings.view"] })
    for (const bad of [
      { name: "x", permissions: ["bookings.view"] },
      { name: "y".repeat(61), permissions: ["bookings.view"] },
      { name: "<b>bold</b>", permissions: ["bookings.view"] },
      { name: "front DESK", permissions: ["bookings.view"] }, // duplicate, any case
      { name: "Empty", permissions: [] },
      { name: "Typo", permissions: ["bookings.viwe"] },
      { name: "Admin", permissions: ["admin.everything"] },
      { name: "Weird", permissions: "bookings.view" },
      { name: "Huge", permissions: Array(200).fill("bookings.view") },
      {},
      null,
    ]) {
      expect([400, 409], JSON.stringify(bad)).toContain((await create(bad)).status)
    }
    expect((await list()).roles.filter((r) => !r.presetKey).map((r) => r.name)).toEqual(["Front desk"])
  })

  it("copies an existing role under a new name", async () => {
    await setup()
    const staff = (await list()).roles.find((r) => r.presetKey === "staff")!
    const res = await create({ cloneFrom: staff.id, name: "Staff (weekends)" })
    expect(res.status).toBe(201)
    expect((await res.json()).role).toMatchObject({ name: "Staff (weekends)", presetKey: null, permissions: staff.permissions })
    expect((await create({ cloneFrom: staff.id, name: "staff (WEEKENDS)" })).status).toBe(400)
  })

  it("stops at the role limit", async () => {
    await setup()
    const existing = (await list()).roles.length
    for (let i = 0; i < MAX_ROLES_PER_BUSINESS - existing; i++) expect((await create({ name: `Role number ${i}`, permissions: ["bookings.view"] })).status).toBe(201)
    const over = await create({ name: "One too many", permissions: ["bookings.view"] })
    expect(over.status).toBe(409)
    expect((await over.json()).code).toBe("LIMIT")
  })
})

describe("no privilege escalation", () => {
  it("a manager can't create roles at all (no roles.manage)", async () => {
    const { organisation, garage } = await setup()
    const mgr = await makeStaff(PREFIX, organisation!.id, { role: "manager", locations: [garage.id] })
    as(mgr.user.id)
    expect((await create({ name: "Sneaky", permissions: ["bookings.view"] })).status).toBe(403)
    expect((await create({ presetKey: "trainee" })).status).toBe(403)
  })

  it("someone allowed to manage roles can only hand out what they hold themselves", async () => {
    const { organisation } = await setup()
    const rolesAdmin = await makeStaff(PREFIX, organisation!.id, { permissions: ["roles.manage", "pricing.view", "pricing.edit"] })
    as(rolesAdmin.user.id)
    expect((await create({ name: "Price checker", permissions: ["pricing.view"] })).status).toBe(201)
    for (const perms of [["billing.manage"], ["pricing.view", "customers.export"], ["staff.manage"]]) {
      const res = await create({ name: `Too much ${perms[0]}`, permissions: perms })
      expect(res.status, perms.join()).toBe(403)
      expect((await res.json()).error).toMatch(/don't have yourself/)
    }
    expect((await create({ presetKey: "accounts" })).status).toBe(403) // a preset is held to the same rule
    expect((await create({ presetKey: "trainee" })).status).toBe(403)
  })

  it("can't edit a role they hold into something stronger, or copy the Owner role", async () => {
    const { organisation } = await setup()
    const rolesAdmin = await makeStaff(PREFIX, organisation!.id, { permissions: ["roles.manage", "pricing.view"] })
    as(rolesAdmin.user.id)
    const mine = rolesAdmin.role
    expect((await patch(mine.id, { permissions: ["roles.manage", "pricing.view", "pricing.edit"] })).status).toBe(403)
    const owner = (await list()).roles.find((r) => r.presetKey === "owner")!
    expect((await create({ cloneFrom: owner.id, name: "Almost owner" })).status).toBe(403)
  })
})

describe("editing and switching roles off", () => {
  it("renames and re-permissions a preset, marking it edited", async () => {
    await setup()
    const { role } = await (await create({ presetKey: "receptionist" })).json()
    const res = await patch(role.id, { name: "Front desk", permissions: ["bookings.manage", "diary.view"] })
    expect(res.status).toBe(200)
    expect((await res.json()).role).toMatchObject({ name: "Front desk", edited: true, permissions: expect.arrayContaining(["bookings.manage", "diary.view"]) })
  })

  it("the Owner role can't be changed; Manager and Staff can be re-permissioned but not switched off", async () => {
    await setup()
    const roles = (await list()).roles
    const owner = roles.find((r) => r.presetKey === "owner")!
    const manager = roles.find((r) => r.presetKey === "manager")!
    expect((await patch(owner.id, { name: "Boss" })).status).toBe(403)
    expect((await patch(owner.id, { permissions: ["bookings.view"] })).status).toBe(403)
    expect((await patch(manager.id, { permissions: ["bookings.manage", "diary.manage", "staff.manage"] })).status).toBe(200)
    expect((await patch(manager.id, { isEnabled: false })).status).toBe(403)
    expect((await del(manager.id)).status).toBe(403)
    expect((await del(owner.id)).status).toBe(403)
  })

  it("won't switch off or delete a role someone holds (409, with how many)", async () => {
    const { organisation } = await setup()
    const { role } = await (await create({ presetKey: "trainee" })).json()
    await makeStaff(PREFIX, organisation!.id, { role: "trainee", key: "t1" })
    const off = await patch(role.id, { isEnabled: false })
    expect(off.status).toBe(409)
    expect(await off.json()).toMatchObject({ code: "IN_USE", members: 1 })
    expect((await del(role.id)).status).toBe(409)
  })

  it("switches an unused role off and on again", async () => {
    await setup()
    const { role } = await (await create({ presetKey: "trainee" })).json()
    expect((await (await patch(role.id, { isEnabled: false })).json()).role.isEnabled).toBe(false)
    expect((await (await patch(role.id, { isEnabled: true })).json()).role.isEnabled).toBe(true)
  })

  it("deletes an unused custom role, returning a preset to the library", async () => {
    await setup()
    const { role } = await (await create({ presetKey: "trainee" })).json()
    expect((await del(role.id)).status).toBe(200)
    expect((await list()).library.map((p) => p.key)).toContain("trainee")
  })

  it("resets a preset to the library version, and refuses to mix that with other edits", async () => {
    await setup()
    const { role } = await (await create({ presetKey: "trainee" })).json()
    await patch(role.id, { permissions: ["bookings.view", "diary.view", "customers.view"] })
    expect((await patch(role.id, { resetToPreset: true, name: "x" })).status).toBe(400)
    const reset = await (await patch(role.id, { resetToPreset: true })).json()
    expect(reset.role).toMatchObject({ edited: false, permissions: ["bookings.view", "bookings.viewOwn", "diary.view", "diary.viewOwn"] })
    // a custom role has no library version
    const custom = await (await create({ name: "Mine", permissions: ["bookings.view"] })).json()
    expect((await patch(custom.role.id, { resetToPreset: true })).status).toBe(400)
  })

  it("rejects unknown fields in an update", async () => {
    await setup()
    const { role } = await (await create({ presetKey: "trainee" })).json()
    expect((await patch(role.id, { isSystem: true })).status).toBe(400)
    expect((await patch(role.id, { organisationId: "other" })).status).toBe(400)
  })
})

describe("one business can never touch another's roles", () => {
  it("404s on another business's role id, for update and delete", async () => {
    const a = await setup()
    const b = await makeGarage(PREFIX, { key: "other" })
    const theirs = await prisma.role.findFirstOrThrow({ where: { organisationId: b.organisation!.id, presetKey: "staff" } })
    as(a.user.id)
    expect((await patch(theirs.id, { permissions: ["bookings.view"] })).status).toBe(404)
    expect((await del(theirs.id)).status).toBe(404)
    expect((await create({ cloneFrom: theirs.id, name: "Stolen" })).status).toBe(404)
    expect((await prisma.role.findUniqueOrThrow({ where: { id: theirs.id } })).name).toBe("Staff")
  })
})

describe("availability", () => {
  it("is hidden (404) while the staff feature is switched off in production", async () => {
    await setup()
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("ORG_FEATURES", "")
    expect((await GET(new Request("http://x"))).status).toBe(404)
    expect((await create({ presetKey: "trainee" })).status).toBe(404)
    vi.stubEnv("ORG_FEATURES", "staff")
    expect((await GET(new Request("http://x"))).status).toBe(200)
  })

  it("a legacy garage that hasn't been upgraded to a business gets a clear message", async () => {
    const legacy = await makeGarage(PREFIX, { key: "old", legacy: true })
    as(legacy.user.id)
    const res = await GET(new Request("http://x"))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/hasn't been set up as a business/)
  })

  it("works for locations too: the business's roles are the same whichever location is selected", async () => {
    const { organisation, user } = await setup()
    const second = await makeLocation(PREFIX, organisation!.id, { key: "second" })
    as(user.id)
    const a = await list()
    const res = await GET(new Request("http://x", { headers: { "x-qmg-location": second.id } }))
    expect((await res.json()).roles.map((r: { id: string }) => r.id)).toEqual(a.roles.map((r) => r.id))
  })
})
