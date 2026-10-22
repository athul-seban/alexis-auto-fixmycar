import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest"
import bcrypt from "bcryptjs"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { cleanupPrefix, makeGarage, makeLocation, makeOwner, makeStaff } from "@/test/fixtures"
import { hashInviteToken } from "@/lib/org/invites"
import { requireGarage } from "@/lib/garage-auth"
import { removeAssignment, removeMember } from "@/lib/org/staff-service"
import { GET as listGet } from "./route"
import { POST as invitePost } from "./invites/route"
import { DELETE as inviteDelete, POST as inviteResend } from "./invites/[id]/route"
import { DELETE as memberDelete, PATCH as memberPatch } from "./[membershipId]/route"
import { POST as assignPost } from "./[membershipId]/assignments/route"
import { DELETE as assignDelete } from "./[membershipId]/assignments/[assignmentId]/route"
import { GET as joinGet, POST as joinPost } from "../../join/[token]/route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue({ success: true }) }))

const mockSession = vi.mocked(getServerSession)
const mockMail = vi.mocked(sendMail)
const PREFIX = "staffsvc-"
const email = (n: string) => `${PREFIX}${n}@example.com`
const as = (id: string, role = "GARAGE") => mockSession.mockResolvedValue({ user: { id, role, email: `${id}@example.com` } } as never)
const anon = () => mockSession.mockResolvedValue(null as never)
const jsonReq = (method: string, body?: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
const req = (path: string, init?: RequestInit) => new Request(`http://x/api/${path}`, init)
const p = <T,>(v: T) => ({ params: Promise.resolve(v) })

const invite = (body: unknown) => invitePost(req("garage/staff/invites", jsonReq("POST", body)))
const list = async () => (await (await listGet(req("garage/staff"))).json()) as { members: { membershipId: string; userId: string; email: string; status: string; isSelf: boolean; isOwner: boolean; canManage: boolean; assignments: { id: string; roleName: string; scopeKey: string; locationName: string | null }[] }[]; invites: { id: string; email: string }[] }
const tokenOf = (devUrl: string) => devUrl.split("/join/")[1]
const accept = (token: string, body: unknown = {}) => joinPost(req(`join/${token}`, jsonReq("POST", body)), p({ token }))
const preview = async (token: string) => (await joinGet(req(`join/${token}`), p({ token }))).json() as Promise<{ state: string; account?: string; businessName?: string; email?: string; roleNames?: string[] }>

beforeEach(async () => {
  mockSession.mockReset()
  mockMail.mockClear()
  await prisma.rateLimitHit.deleteMany({ where: { OR: [{ key: { startsWith: "staff-invite:" } }, { key: { startsWith: "join-" } }] } })
  await cleanupPrefix(PREFIX)
  await prisma.staffInvite.deleteMany({ where: { email: { startsWith: PREFIX } } })
})
afterEach(() => vi.unstubAllEnvs())
afterAll(async () => {
  await cleanupPrefix(PREFIX)
  await prisma.staffInvite.deleteMany({ where: { email: { startsWith: PREFIX } } })
})

async function setup() {
  const biz = await makeGarage(PREFIX, { key: "leeds" })
  const york = await makeLocation(PREFIX, biz.organisation!.id, { key: "york" })
  const roles = await prisma.role.findMany({ where: { organisationId: biz.organisation!.id } })
  const role = (k: string) => roles.find((r) => r.presetKey === k)!
  as(biz.user.id)
  return { ...biz, york, roles, role }
}

async function inviteAndToken(roleId: string, to: string, locationIds: string[] | null = null) {
  const res = await invite({ email: to, assignments: [{ roleId, locationIds }] })
  expect(res.status).toBe(201)
  return tokenOf((await res.json()).devUrl)
}

describe("inviting", () => {
  it("emails a single-use link, stores only its hash, and lists the invitation", async () => {
    const s = await setup()
    const res = await invite({ email: email("new"), name: "Nia", assignments: [{ roleId: s.role("manager").id, locationIds: null }] })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.emailSent).toBe(true)
    const token = tokenOf(body.devUrl)

    const row = await prisma.staffInvite.findFirstOrThrow({ where: { email: email("new") } })
    expect(row.tokenHash).toBe(hashInviteToken(token))
    expect(JSON.stringify(row)).not.toContain(token) // the token itself is never stored
    expect(row.organisationId).toBe(s.organisation!.id)
    const days = (row.expiresAt.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThan(7.1)

    expect(mockMail).toHaveBeenCalledTimes(1)
    expect(mockMail.mock.calls[0][0]).toMatchObject({ to: email("new") })
    expect(mockMail.mock.calls[0][0].html).toContain(`/join/${token}`)
    expect((await list()).invites.map((i) => i.email)).toEqual([email("new")])
  })

  it("a new invitation to the same email replaces the old one: only one link is ever live", async () => {
    const s = await setup()
    const first = await inviteAndToken(s.role("staff").id, email("twice"))
    const second = await inviteAndToken(s.role("staff").id, email("twice"))
    expect((await preview(first)).state).toBe("revoked")
    expect((await preview(second)).state).toBe("ok")
    expect(await prisma.staffInvite.count({ where: { email: email("twice"), acceptedAt: null, revokedAt: null } })).toBe(1)
  })

  it("validates the request", async () => {
    const s = await setup()
    const other = await makeGarage(PREFIX, { key: "other" })
    const theirRole = await prisma.role.findFirstOrThrow({ where: { organisationId: other.organisation!.id, presetKey: "staff" } })
    for (const [bad, status] of [
      [{ email: "nope", assignments: [{ roleId: s.role("staff").id, locationIds: null }] }, 400],
      [{ email: email("v"), assignments: [] }, 400],
      [{ email: email("v") }, 400],
      [{ email: email("v"), assignments: [{ roleId: s.role("staff").id, locationIds: [] }] }, 400],
      [{ email: email("v"), assignments: [{ roleId: "no-such-role", locationIds: null }] }, 404],
      [{ email: email("v"), assignments: [{ roleId: theirRole.id, locationIds: null }] }, 404], // another business's role
      [{ email: email("v"), assignments: [{ roleId: s.role("staff").id, locationIds: [other.garage.id] }] }, 400], // another business's location
    ] as const) {
      expect((await invite(bad)).status, JSON.stringify(bad)).toBe(status)
    }
    expect(await prisma.staffInvite.count({ where: { organisationId: s.organisation!.id } })).toBe(0)
    expect(mockMail).not.toHaveBeenCalled()
  })

  it("refuses an existing member, a platform administrator and a suspended account", async () => {
    const s = await setup()
    const member = await makeStaff(PREFIX, s.organisation!.id, { key: "member", role: "staff" })
    const admin = await prisma.user.create({ data: { email: email("admin"), role: "ADMIN" } })
    const suspended = await prisma.user.create({ data: { email: email("sus"), role: "OWNER", suspendedAt: new Date() } })
    const asg = [{ roleId: s.role("staff").id, locationIds: null }]
    expect((await invite({ email: member.user.email, assignments: asg })).status).toBe(409)
    expect((await invite({ email: admin.email, assignments: asg })).status).toBe(403)
    expect((await invite({ email: suspended.email, assignments: asg })).status).toBe(403)
    expect(mockMail).not.toHaveBeenCalled()
  })

  it("is limited per business", async () => {
    const s = await setup()
    await prisma.rateLimitHit.createMany({ data: Array.from({ length: 30 }, () => ({ key: `staff-invite:key:${s.organisation!.id}` })) })
    expect((await invite({ email: email("limited"), assignments: [{ roleId: s.role("staff").id, locationIds: null }] })).status).toBe(429)
    expect(mockMail).not.toHaveBeenCalled()
  })

  it("ordinary staff can't invite anyone, and the feature can be switched off", async () => {
    const s = await setup()
    const staff = await makeStaff(PREFIX, s.organisation!.id, { key: "stf", role: "staff" })
    as(staff.user.id)
    expect((await invite({ email: email("x"), assignments: [{ roleId: s.role("staff").id, locationIds: null }] })).status).toBe(403)

    as(s.user.id)
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("ORG_FEATURES", "")
    expect((await invite({ email: email("x"), assignments: [{ roleId: s.role("staff").id, locationIds: null }] })).status).toBe(404)
  })
})

describe("who may hand out what (no escalation through invitations)", () => {
  it("a manager can invite at their own location, but not elsewhere, not everywhere, and never an Owner", async () => {
    const s = await setup()
    const mgr = await makeStaff(PREFIX, s.organisation!.id, { key: "mgr", role: "manager", locations: [s.garage.id] })
    as(mgr.user.id)
    const ask = (roleKey: string, locationIds: string[] | null) => invite({ email: email(`m-${roleKey}-${locationIds?.[0] ?? "all"}`), assignments: [{ roleId: s.role(roleKey).id, locationIds }] })
    expect((await ask("staff", [s.garage.id])).status).toBe(201)
    expect((await ask("manager", [s.garage.id])).status).toBe(201)
    expect((await ask("staff", [s.york.id])).status).toBe(403) // not their location
    expect((await ask("staff", null)).status).toBe(403) // everywhere needs power everywhere
    expect((await ask("owner", null)).status).toBe(403)
    expect((await ask("owner", [s.garage.id])).status).toBe(403)
  })

  it("an Owner can invite another Owner, but only everywhere", async () => {
    const s = await setup()
    expect((await invite({ email: email("o1"), assignments: [{ roleId: s.role("owner").id, locationIds: null }] })).status).toBe(201)
    expect((await invite({ email: email("o2"), assignments: [{ roleId: s.role("owner").id, locationIds: [s.garage.id] }] })).status).toBe(403)
  })

  it("can't hand out a role stronger than your own, nor a role that is switched off", async () => {
    const s = await setup()
    const people = await makeStaff(PREFIX, s.organisation!.id, { key: "ppl", permissions: ["staff.manage", "bookings.view"], locations: [s.garage.id] })
    as(people.user.id)
    expect((await invite({ email: email("w"), assignments: [{ roleId: s.role("staff").id, locationIds: [s.garage.id] }] })).status).toBe(403) // staff can manage bookings
    await prisma.role.update({ where: { id: s.role("staff").id }, data: { isEnabled: false } })
    as(s.user.id)
    const off = await invite({ email: email("w2"), assignments: [{ roleId: s.role("staff").id, locationIds: null }] })
    expect(off.status).toBe(403)
    expect((await off.json()).error).toMatch(/switched off/)
  })
})

describe("accepting: a brand-new person", () => {
  it("previews the invitation, then creates their account and gives them exactly the invited access", async () => {
    const s = await setup()
    const token = await inviteAndToken(s.role("staff").id, email("fresh"), [s.york.id])
    expect(await preview(token)).toMatchObject({ state: "ok", account: "none", businessName: s.organisation!.name, email: email("fresh"), roleNames: ["Staff"] })

    anon()
    expect((await accept(token, { name: "Nia", password: "short" })).status).toBe(400)
    expect((await accept(token, { password: "a-long-passphrase-7" })).status).toBe(400) // needs a name
    expect(await prisma.user.count({ where: { email: email("fresh") } })).toBe(0)

    const res = await accept(token, { name: "Nia Fresh", password: "a-long-passphrase-7" })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ converted: false })

    const user = await prisma.user.findUniqueOrThrow({ where: { email: email("fresh") }, include: { memberships: { include: { assignments: { include: { role: true } } } } } })
    expect(user).toMatchObject({ role: "GARAGE", name: "Nia Fresh" })
    expect(user.emailVerified).not.toBeNull() // the link proved the inbox
    expect(await bcrypt.compare("a-long-passphrase-7", user.password!)).toBe(true)
    expect(user.memberships).toHaveLength(1)
    expect(user.memberships[0].organisationId).toBe(s.organisation!.id)
    expect(user.memberships[0].assignments.map((a) => [a.role.presetKey, a.scopeKey])).toEqual([["staff", s.york.id]])

    // and they can actually use the portal, at York only
    as(user.id)
    const r = await requireGarage({ permission: "bookings.manage" })
    expect(r.ok && r.ctx.garage.id).toBe(s.york.id)
    expect(r.ok && r.ctx.locations.map((l) => l.id)).toEqual([s.york.id])
  })

  it("the password may not contain their email name", async () => {
    const s = await setup()
    const token = await inviteAndToken(s.role("staff").id, email("fresh2"))
    anon()
    expect((await accept(token, { name: "Nia", password: `${PREFIX}fresh2-passphrase` })).status).toBe(400)
  })

  it("an invitation works once: a second use, or a double click, creates nothing more", async () => {
    const s = await setup()
    const token = await inviteAndToken(s.role("staff").id, email("once"))
    anon()
    const body = { name: "Once Only", password: "a-long-passphrase-7" }
    const results = await Promise.all([accept(token, body), accept(token, body), accept(token, body)])
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]) // exactly one wins the race
    expect(await prisma.membership.count({ where: { user: { email: email("once") } } })).toBe(1)
    expect((await accept(token, body)).status).toBe(409)
    expect((await preview(token)).state).toBe("used")
  })
})

describe("accepting: someone who already has an account", () => {
  it("garage staff from another business must be signed in as that account", async () => {
    const s = await setup()
    const other = await makeGarage(PREFIX, { key: "other" })
    const token = await inviteAndToken(s.role("staff").id, other.user.email)
    expect((await preview(token)).account).toBe("existing")

    anon()
    const noLogin = await accept(token)
    expect(noLogin.status).toBe(401)
    expect((await noLogin.json()).code).toBe("SIGN_IN_REQUIRED")

    const stranger = await makeGarage(PREFIX, { key: "stranger" })
    as(stranger.user.id) // signed in as someone else
    expect((await accept(token)).status).toBe(401)
    expect(await prisma.membership.count({ where: { userId: other.user.id, organisationId: s.organisation!.id } })).toBe(0)

    as(other.user.id)
    expect((await accept(token)).status).toBe(201)
    expect(await prisma.membership.count({ where: { userId: other.user.id, organisationId: s.organisation!.id } })).toBe(1)
    expect(await prisma.membership.count({ where: { userId: other.user.id } })).toBe(2) // and they keep their own business
  })

  it("a customer account is turned into a staff account only after they confirm, and signed in as themselves", async () => {
    const s = await setup()
    const customer = await makeOwner(PREFIX, "cust")
    const token = await inviteAndToken(s.role("staff").id, customer.user.email)
    expect((await preview(token)).account).toBe("customer")

    anon()
    expect((await accept(token, { confirmConvert: true })).status).toBe(401)
    as(customer.user.id, "OWNER")
    const unconfirmed = await accept(token)
    expect(unconfirmed.status).toBe(409)
    expect((await unconfirmed.json()).code).toBe("CONFIRM_CONVERT")
    expect((await prisma.user.findUniqueOrThrow({ where: { id: customer.user.id } })).role).toBe("OWNER")

    const before = await prisma.user.findUniqueOrThrow({ where: { id: customer.user.id } })
    const res = await accept(token, { confirmConvert: true })
    expect(res.status).toBe(201)
    expect((await res.json()).converted).toBe(true)
    const after = await prisma.user.findUniqueOrThrow({ where: { id: customer.user.id } })
    expect(after.role).toBe("GARAGE")
    expect(after.sessionVersion).toBe(before.sessionVersion + 1) // every session ends, so the new role applies at once
    expect(await prisma.vehicle.count({ where: { ownerId: customer.user.id } })).toBe(1) // their data is kept
  })

  it("a platform administrator or a suspended account can never join", async () => {
    const s = await setup()
    const admin = await prisma.user.create({ data: { email: email("adm"), role: "ADMIN" } })
    // invitations to admins can't even be created, so make one directly to prove accept refuses too
    const token = "adminInviteToken0123456789abcdefghij"
    await prisma.staffInvite.create({ data: { organisationId: s.organisation!.id, email: admin.email, assignments: JSON.stringify([{ roleId: s.role("staff").id, garageIds: null }]), tokenHash: hashInviteToken(token), invitedById: s.user.id, expiresAt: new Date(Date.now() + 86_400_000) } })
    expect((await preview(token)).account).toBe("blocked")
    as(admin.id, "ADMIN")
    expect((await accept(token)).status).toBe(403)
    expect(await prisma.membership.count({ where: { userId: admin.id } })).toBe(0)
  })
})

describe("accepting: invitations that can't be used", () => {
  it("expired, cancelled and unknown tokens", async () => {
    const s = await setup()
    const expired = await inviteAndToken(s.role("staff").id, email("exp"))
    await prisma.staffInvite.updateMany({ where: { email: email("exp") }, data: { expiresAt: new Date(Date.now() - 1000) } })
    anon()
    expect((await preview(expired)).state).toBe("expired")
    expect((await accept(expired, { name: "X Y", password: "a-long-passphrase-7" })).status).toBe(409)

    as(s.user.id)
    const cancelled = await inviteAndToken(s.role("staff").id, email("can"))
    const inv = await prisma.staffInvite.findFirstOrThrow({ where: { email: email("can") } })
    expect((await inviteDelete(req("x", jsonReq("DELETE")), p({ id: inv.id }))).status).toBe(200)
    anon()
    expect((await preview(cancelled)).state).toBe("revoked")
    expect((await accept(cancelled, { name: "X Y", password: "a-long-passphrase-7" })).status).toBe(409)

    for (const junk of ["nope", "x".repeat(200), "../../etc/passwd", "a".repeat(30) + "!"]) {
      expect((await preview(junk)).state, junk).toBe("invalid")
      expect((await accept(junk)).status, junk).toBe(404)
    }
    expect(await prisma.user.count({ where: { email: { in: [email("exp"), email("can")] } } })).toBe(0)
  })

  it("is void if the person who sent it has since left the team", async () => {
    const s = await setup()
    const mgr = await makeStaff(PREFIX, s.organisation!.id, { key: "mgr", role: "manager", locations: [s.garage.id] })
    as(mgr.user.id)
    const token = await inviteAndToken(s.role("staff").id, email("orphan"), [s.garage.id])
    await prisma.membership.delete({ where: { id: mgr.membership.id } })
    anon()
    const res = await accept(token, { name: "Ora Phan", password: "a-long-passphrase-7" })
    expect(res.status).toBe(409)
    expect(await prisma.user.count({ where: { email: email("orphan") } })).toBe(0)
  })

  it("only grants what still exists: a deleted role or location is dropped, and nothing left is an error", async () => {
    const s = await setup()
    const custom = await prisma.role.create({ data: { organisationId: s.organisation!.id, name: "Temp role", permissions: JSON.stringify(["bookings.view"]) } })
    const res = await invite({ email: email("drop"), assignments: [{ roleId: custom.id, locationIds: null }, { roleId: s.role("staff").id, locationIds: [s.york.id] }] })
    const token = tokenOf((await res.json()).devUrl)
    await prisma.role.delete({ where: { id: custom.id } })
    await prisma.garage.update({ where: { id: s.york.id }, data: { organisationId: null } }) // York leaves the business

    anon()
    expect((await accept(token, { name: "Dee Rop", password: "a-long-passphrase-7" })).status).toBe(409) // nothing valid left
    expect(await prisma.user.count({ where: { email: email("drop") } })).toBe(0) // and nothing half-created

    as(s.user.id)
    const t2 = await inviteAndToken(s.role("staff").id, email("drop2"), [s.garage.id])
    await prisma.role.update({ where: { id: s.role("staff").id }, data: { isEnabled: false } })
    anon()
    expect((await accept(t2, { name: "Dee Rop", password: "a-long-passphrase-7" })).status).toBe(409) // a switched-off role is dropped too
  })
})

describe("the team list", () => {
  it("an Owner sees everyone and their roles; a location manager sees only their own location's people", async () => {
    const s = await setup()
    const atLeeds = await makeStaff(PREFIX, s.organisation!.id, { key: "leedsstaff", role: "staff", locations: [s.garage.id] })
    const atYork = await makeStaff(PREFIX, s.organisation!.id, { key: "yorkstaff", role: "staff", locations: [s.york.id] })
    const mgr = await makeStaff(PREFIX, s.organisation!.id, { key: "mgr", role: "manager", locations: [s.garage.id] })

    const all = await list()
    expect(all.members.map((m) => m.email).sort()).toEqual([s.user.email, atLeeds.user.email, atYork.user.email, mgr.user.email].sort())
    expect(all.members.find((m) => m.isSelf)).toMatchObject({ isOwner: true, canManage: false })
    expect(all.members.find((m) => m.email === atYork.user.email)?.assignments[0]).toMatchObject({ roleName: "Staff", locationName: expect.stringContaining("york") })

    as(mgr.user.id)
    const mine = await list()
    expect(mine.members.map((m) => m.email).sort()).toEqual([atLeeds.user.email, mgr.user.email].sort()) // not the Owner, not York's staff
    expect(mine.members.find((m) => m.email === atLeeds.user.email)?.canManage).toBe(true)
    expect(mine.members.find((m) => m.isSelf)?.canManage).toBe(false)
  })

  it("is closed to ordinary staff and never shows another business's people", async () => {
    const s = await setup()
    const other = await makeGarage(PREFIX, { key: "other" })
    const staff = await makeStaff(PREFIX, s.organisation!.id, { key: "stf", role: "staff" })
    expect(JSON.stringify(await list())).not.toContain(other.user.email)
    as(staff.user.id)
    expect((await listGet(req("garage/staff"))).status).toBe(403)
  })
})

describe("changing someone's access", () => {
  it("adds and removes roles, within the caller's own power", async () => {
    const s = await setup()
    const person = await makeStaff(PREFIX, s.organisation!.id, { key: "p", role: "staff", locations: [s.garage.id] })
    const add = await assignPost(req("x", jsonReq("POST", { assignments: [{ roleId: s.role("manager").id, locationIds: [s.york.id] }] })), p({ membershipId: person.membership.id }))
    expect(add.status).toBe(201)
    const after = (await list()).members.find((m) => m.membershipId === person.membership.id)!
    expect(after.assignments.map((a) => a.roleName).sort()).toEqual(["Manager", "Staff"])

    const mgrAssignment = after.assignments.find((a) => a.roleName === "Manager")!
    expect((await assignDelete(req("x", jsonReq("DELETE")), p({ membershipId: person.membership.id, assignmentId: mgrAssignment.id }))).status).toBe(200)
    expect((await list()).members.find((m) => m.membershipId === person.membership.id)!.assignments).toHaveLength(1)
  })

  it("adding a role someone already has changes nothing", async () => {
    const s = await setup()
    const person = await makeStaff(PREFIX, s.organisation!.id, { key: "p", role: "staff", locations: [s.garage.id] })
    const add = () => assignPost(req("x", jsonReq("POST", { assignments: [{ roleId: s.role("staff").id, locationIds: [s.garage.id] }] })), p({ membershipId: person.membership.id }))
    await add()
    await add()
    expect(await prisma.roleAssignment.count({ where: { membershipId: person.membership.id } })).toBe(1)
  })

  it("nobody can change their own access (no self-promotion)", async () => {
    const s = await setup()
    const mgr = await makeStaff(PREFIX, s.organisation!.id, { key: "mgr", role: "manager", locations: [s.garage.id] })
    as(mgr.user.id)
    const self = await assignPost(req("x", jsonReq("POST", { assignments: [{ roleId: s.role("staff").id, locationIds: [s.garage.id] }] })), p({ membershipId: mgr.membership.id }))
    expect(self.status).toBe(403)
    expect((await self.json()).error).toMatch(/your own access/)
    const mine = (await prisma.membership.findUniqueOrThrow({ where: { id: mgr.membership.id }, include: { assignments: true } })).assignments
    expect((await assignDelete(req("x", jsonReq("DELETE")), p({ membershipId: mgr.membership.id, assignmentId: mine[0].id }))).status).toBe(403)
    expect((await memberPatch(req("x", jsonReq("PATCH", { status: "SUSPENDED" })), p({ membershipId: mgr.membership.id }))).status).toBe(403)
    expect((await memberDelete(req("x", jsonReq("DELETE")), p({ membershipId: mgr.membership.id }))).status).toBe(403)
  })

  it("a manager can't touch someone who outranks them, or someone at another location", async () => {
    const s = await setup()
    const mgr = await makeStaff(PREFIX, s.organisation!.id, { key: "mgr", role: "manager", locations: [s.garage.id] })
    const atYork = await makeStaff(PREFIX, s.organisation!.id, { key: "y", role: "staff", locations: [s.york.id] })
    const owner2 = await makeStaff(PREFIX, s.organisation!.id, { key: "o2", role: "owner" })
    as(mgr.user.id)
    for (const target of [atYork, owner2]) {
      expect((await memberPatch(req("x", jsonReq("PATCH", { status: "SUSPENDED" })), p({ membershipId: target.membership.id }))).status).toBe(403)
      expect((await memberDelete(req("x", jsonReq("DELETE")), p({ membershipId: target.membership.id }))).status).toBe(403)
      // Taking access away needs power over everything the person holds, so their other assignments can't be removed either.
      const theirs = await prisma.roleAssignment.findFirstOrThrow({ where: { membershipId: target.membership.id } })
      expect((await assignDelete(req("x", jsonReq("DELETE")), p({ membershipId: target.membership.id, assignmentId: theirs.id }))).status).toBe(403)
    }
    expect(await prisma.membership.count({ where: { id: { in: [atYork.membership.id, owner2.membership.id] }, status: "ACTIVE" } })).toBe(2)
    expect(await prisma.roleAssignment.count({ where: { membershipId: { in: [atYork.membership.id, owner2.membership.id] } } })).toBe(2)

    // Giving someone MORE access at a place the manager runs is fine: it can't raise them above the manager there.
    const lend = await assignPost(req("x", jsonReq("POST", { assignments: [{ roleId: s.role("staff").id, locationIds: [s.garage.id] }] })), p({ membershipId: atYork.membership.id }))
    expect(lend.status).toBe(201)
    // ...but not a role stronger than the manager's own, and not at a place they don't run
    expect((await assignPost(req("x", jsonReq("POST", { assignments: [{ roleId: s.role("owner").id, locationIds: null }] })), p({ membershipId: atYork.membership.id }))).status).toBe(403)
    expect((await assignPost(req("x", jsonReq("POST", { assignments: [{ roleId: s.role("manager").id, locationIds: [s.york.id] }] })), p({ membershipId: atYork.membership.id }))).status).toBe(403)
  })

  it("an Owner can make another Owner and an Owner can demote one (but never themselves)", async () => {
    const s = await setup()
    const second = await makeStaff(PREFIX, s.organisation!.id, { key: "second", role: "staff" })
    const give = await assignPost(req("x", jsonReq("POST", { assignments: [{ roleId: s.role("owner").id, locationIds: null }] })), p({ membershipId: second.membership.id }))
    expect(give.status).toBe(201)

    as(second.user.id) // now an Owner too
    const first = (await list()).members.find((m) => m.userId === s.user.id)!
    const ownerAssignment = first.assignments.find((a) => a.roleName === "Owner")!
    expect((await assignDelete(req("x", jsonReq("DELETE")), p({ membershipId: first.membershipId, assignmentId: ownerAssignment.id }))).status).toBe(200)
  })

  it("the last Owner can't be removed, demoted or suspended, even by someone with total power", async () => {
    const s = await setup()
    const ownerAssignment = await prisma.roleAssignment.findFirstOrThrow({ where: { membershipId: s.membership!.id } })
    // A legacy context holds every permission and isn't a member, so it is the strongest caller there is.
    const strongest = { organisation: s.organisation, assignments: [], roles: [], legacy: true, actor: { id: "support", email: null }, locations: [] }
    await expect(removeAssignment(strongest, "support", s.membership!.id, ownerAssignment.id)).rejects.toMatchObject({ code: "LAST_OWNER" })
    await expect(removeMember(strongest, "support", s.membership!.id)).rejects.toMatchObject({ code: "LAST_OWNER" })
    expect(await prisma.membership.count({ where: { id: s.membership!.id, status: "ACTIVE" } })).toBe(1)
  })

  it("another business's member or assignment ids are 'not found'", async () => {
    const s = await setup()
    const other = await makeGarage(PREFIX, { key: "other" })
    const theirs = other.membership!
    const theirAssignment = await prisma.roleAssignment.findFirstOrThrow({ where: { membershipId: theirs.id } })
    expect((await memberPatch(req("x", jsonReq("PATCH", { status: "SUSPENDED" })), p({ membershipId: theirs.id }))).status).toBe(404)
    expect((await memberDelete(req("x", jsonReq("DELETE")), p({ membershipId: theirs.id }))).status).toBe(404)
    expect((await assignDelete(req("x", jsonReq("DELETE")), p({ membershipId: theirs.id, assignmentId: theirAssignment.id }))).status).toBe(404)
    expect((await assignPost(req("x", jsonReq("POST", { assignments: [{ roleId: s.role("staff").id, locationIds: null }] })), p({ membershipId: theirs.id }))).status).toBe(404)
    expect((await inviteDelete(req("x", jsonReq("DELETE")), p({ id: "not-mine" }))).status).toBe(404)
    expect((await inviteResend(req("x", jsonReq("POST")), p({ id: "not-mine" }))).status).toBe(404)
    expect(await prisma.membership.count({ where: { id: theirs.id, status: "ACTIVE" } })).toBe(1)
  })
})

describe("suspending and removing", () => {
  it("a suspended member is locked out at once and can be reinstated", async () => {
    const s = await setup()
    const person = await makeStaff(PREFIX, s.organisation!.id, { key: "p", role: "staff" })
    as(person.user.id)
    expect((await requireGarage()).ok).toBe(true)

    as(s.user.id)
    expect((await memberPatch(req("x", jsonReq("PATCH", { status: "SUSPENDED" })), p({ membershipId: person.membership.id }))).status).toBe(200)
    as(person.user.id)
    const locked = await requireGarage()
    expect(!locked.ok && locked.response.status).toBe(403)

    as(s.user.id)
    expect((await memberPatch(req("x", jsonReq("PATCH", { status: "ACTIVE" })), p({ membershipId: person.membership.id }))).status).toBe(200)
    as(person.user.id)
    expect((await requireGarage()).ok).toBe(true)
    as(s.user.id)
    expect((await memberPatch(req("x", jsonReq("PATCH", { status: "NOPE" })), p({ membershipId: person.membership.id }))).status).toBe(400)
  })

  it("removing someone ends their access, unlinks their technician, and returns a staff-only account to a customer account", async () => {
    const s = await setup()
    const person = await makeStaff(PREFIX, s.organisation!.id, { key: "tech", role: "staff" })
    const tech = await prisma.technician.create({ data: { garageId: s.garage.id, name: "Terry", userId: person.user.id } })
    const before = await prisma.user.findUniqueOrThrow({ where: { id: person.user.id } })

    expect((await memberDelete(req("x", jsonReq("DELETE")), p({ membershipId: person.membership.id }))).status).toBe(200)
    expect(await prisma.membership.count({ where: { id: person.membership.id } })).toBe(0)
    expect(await prisma.roleAssignment.count({ where: { membershipId: person.membership.id } })).toBe(0)
    expect((await prisma.technician.findUniqueOrThrow({ where: { id: tech.id } })).userId).toBeNull() // still in the diary
    const after = await prisma.user.findUniqueOrThrow({ where: { id: person.user.id } })
    expect(after.role).toBe("OWNER")
    expect(after.sessionVersion).toBe(before.sessionVersion + 1)
    const entry = await prisma.auditLog.findFirst({ where: { action: "STAFF_REMOVED", organisationId: s.organisation!.id } })
    expect(entry?.detail).toContain(person.user.email)
  })

  it("someone who also works for another business keeps their garage account", async () => {
    const s = await setup()
    const other = await makeGarage(PREFIX, { key: "other" })
    const person = await makeStaff(PREFIX, s.organisation!.id, { key: "both", role: "staff" })
    const staffRole = await prisma.role.findFirstOrThrow({ where: { organisationId: other.organisation!.id, presetKey: "staff" } })
    await prisma.membership.create({ data: { userId: person.user.id, organisationId: other.organisation!.id, assignments: { create: { roleId: staffRole.id, scopeKey: "*" } } } })

    await memberDelete(req("x", jsonReq("DELETE")), p({ membershipId: person.membership.id }))
    const after = await prisma.user.findUniqueOrThrow({ where: { id: person.user.id } })
    expect(after.role).toBe("GARAGE")
    expect(await prisma.membership.count({ where: { userId: person.user.id } })).toBe(1)
  })
})

describe("resending", () => {
  it("sends a fresh link: the old one stops working", async () => {
    const s = await setup()
    const old = await inviteAndToken(s.role("staff").id, email("again"))
    const inv = await prisma.staffInvite.findFirstOrThrow({ where: { email: email("again") } })
    mockMail.mockClear()
    const res = await inviteResend(req("x", jsonReq("POST")), p({ id: inv.id }))
    expect(res.status).toBe(200)
    const fresh = tokenOf((await res.json()).devUrl)
    expect(fresh).not.toBe(old)
    expect(mockMail).toHaveBeenCalledTimes(1)
    expect((await preview(old)).state).toBe("invalid")
    expect((await preview(fresh)).state).toBe("ok")
  })

  it("can't resend or cancel an invitation that was already used or cancelled", async () => {
    const s = await setup()
    const token = await inviteAndToken(s.role("staff").id, email("used"))
    const inv = await prisma.staffInvite.findFirstOrThrow({ where: { email: email("used") } })
    anon()
    await accept(token, { name: "Used Up", password: "a-long-passphrase-7" })
    as(s.user.id)
    expect((await inviteResend(req("x", jsonReq("POST")), p({ id: inv.id }))).status).toBe(409)
    expect((await inviteDelete(req("x", jsonReq("DELETE")), p({ id: inv.id }))).status).toBe(409)
  })
})
