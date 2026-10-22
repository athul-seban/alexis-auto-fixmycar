import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { cleanupPrefix, makeGarage, makeLocation, makeStaff, makeWalkInBooking } from "@/test/fixtures"
import { GET as bookingsGet } from "./bookings/route"
import { GET as bookingGet, PATCH as bookingPatch } from "./bookings/[id]/route"
import { GET as diaryGet } from "./diary/route"
import { GET as techniciansGet } from "./technicians/route"
import { PATCH as technicianPatch } from "./technicians/[id]/route"
import { GET as overviewGet } from "./overview/route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue({ success: true }) }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "ownjobs-"
const as = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE", email: `${id}@example.com` } } as never)
const p = <T,>(v: T) => ({ params: Promise.resolve(v) })
const req = (url: string, init?: RequestInit) => new Request(`http://x/api/garage/${url}`, init)
const json = (method: string, body: unknown, headers: Record<string, string> = {}) => ({ method, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) })
const HOUR = 3_600_000

const OWN = ["bookings.viewOwn", "bookings.updateOwn", "diary.viewOwn"] as const

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

/** A location with two technicians, each with a login, and a job each plus one nobody has been given. */
async function setup() {
  const biz = await makeGarage(PREFIX, { key: "shop" })
  const gid = biz.garage.id
  const orgId = biz.organisation!.id
  const [t1, t2] = await Promise.all([
    prisma.technician.create({ data: { garageId: gid, name: "Tess Tech", sortOrder: 0 } }),
    prisma.technician.create({ data: { garageId: gid, name: "Tom Tech", sortOrder: 1 } }),
  ])
  const u1 = await makeStaff(PREFIX, orgId, { key: "tess", permissions: [...OWN], locations: [gid] })
  const u2 = await makeStaff(PREFIX, orgId, { key: "tom", permissions: [...OWN], locations: [gid] })
  const unlinked = await makeStaff(PREFIX, orgId, { key: "unlinked", permissions: [...OWN], locations: [gid] })
  const manager = await makeStaff(PREFIX, orgId, { key: "mgr", role: "manager", locations: [gid] })
  await prisma.technician.update({ where: { id: t1.id }, data: { userId: u1.user.id } })
  await prisma.technician.update({ where: { id: t2.id }, data: { userId: u2.user.id } })

  const soon = new Date(Date.now() - HOUR) // started an hour ago, so every outcome is allowed
  const job1 = await makeWalkInBooking(gid, { technicianId: t1.id, status: "CONFIRMED", scheduledAt: soon, customerName: "Customer One" })
  const job2 = await makeWalkInBooking(gid, { technicianId: t2.id, status: "CONFIRMED", scheduledAt: soon, customerName: "Customer Two" })
  const free = await makeWalkInBooking(gid, { technicianId: null, status: "CONFIRMED", scheduledAt: soon, customerName: "Customer Three" })
  return { ...biz, gid, orgId, t1, t2, u1, u2, unlinked, manager, job1, job2, free }
}

const names = (body: { bookings: { customerName: string | null }[] }) => body.bookings.map((b) => b.customerName).sort()

describe("bookings list", () => {
  it("a technician sees only the jobs assigned to them; a manager sees them all", async () => {
    const s = await setup()
    as(s.u1.user.id)
    const mine = await (await bookingsGet(req("bookings"))).json()
    expect(names(mine)).toEqual(["Customer One"])
    expect(mine.total).toBe(1)

    as(s.u2.user.id)
    expect(names(await (await bookingsGet(req("bookings"))).json())).toEqual(["Customer Two"])

    as(s.manager.user.id)
    expect(names(await (await bookingsGet(req("bookings"))).json())).toEqual(["Customer One", "Customer Three", "Customer Two"])
  })

  it("counts, searches and filters stay inside their own jobs", async () => {
    const s = await setup()
    as(s.u1.user.id)
    // All three bookings match this search (they share a vehicle); only the technician's own come back.
    const body = await (await bookingsGet(req("bookings?q=wk19abc"))).json()
    expect(names(body)).toEqual(["Customer One"])
    expect(body.total).toBe(1)
    expect(Object.values(body.counts as Record<string, number>).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(2) // 1 booking can sit in at most 2 tabs
    expect(body.counts.estimates).toBe(0)

    as(s.manager.user.id)
    expect((await (await bookingsGet(req("bookings?q=wk19abc"))).json()).total).toBe(3)
  })

  it("a technician login that isn't linked to a technician sees nothing, never everything", async () => {
    const s = await setup()
    as(s.unlinked.user.id)
    const body = await (await bookingsGet(req("bookings"))).json()
    expect(body.bookings).toEqual([])
    expect(body.total).toBe(0)
  })

  it("a deactivated technician's login stops seeing jobs", async () => {
    const s = await setup()
    await prisma.technician.update({ where: { id: s.t1.id }, data: { isActive: false } })
    as(s.u1.user.id)
    expect((await (await bookingsGet(req("bookings"))).json()).bookings).toEqual([])
  })

  it("can't download the whole list", async () => {
    const s = await setup()
    as(s.u1.user.id)
    expect((await bookingsGet(req("bookings?format=csv"))).status).toBe(403)
  })

  it("the same person has no jobs at a location where they aren't linked", async () => {
    const s = await setup()
    const other = await makeLocation(PREFIX, s.orgId, { key: "other" })
    await makeWalkInBooking(other.id, { technicianId: null, customerName: "Elsewhere" })
    // Tess works at both, but is a technician only at the first.
    await prisma.roleAssignment.create({ data: { membershipId: s.u1.membership.id, roleId: s.u1.role.id, garageId: other.id, scopeKey: other.id } })
    as(s.u1.user.id)
    const there = await (await bookingsGet(req("bookings", { headers: { "x-qmg-location": other.id } }))).json()
    expect(there.bookings).toEqual([])
  })
})

describe("a single booking", () => {
  it("can be opened if it is theirs, and is 'not found' if it is anyone else's or nobody's", async () => {
    const s = await setup()
    as(s.u1.user.id)
    expect((await bookingGet(req("x"), p({ id: s.job1.id }))).status).toBe(200)
    expect((await bookingGet(req("x"), p({ id: s.job2.id }))).status).toBe(404)
    expect((await bookingGet(req("x"), p({ id: s.free.id }))).status).toBe(404)
  })
})

describe("updating a job", () => {
  const patch = (id: string, body: unknown) => bookingPatch(req("x", json("PATCH", body)), p({ id }))

  it("lets a technician record that their job started, then finished, with notes", async () => {
    const s = await setup()
    as(s.u1.user.id)
    expect((await patch(s.job1.id, { status: "IN_PROGRESS" })).status).toBe(200)
    const done = await patch(s.job1.id, { status: "COMPLETED", notes: "Replaced pads" })
    expect(done.status).toBe(200)
    expect(await prisma.booking.findUniqueOrThrow({ where: { id: s.job1.id } })).toMatchObject({ status: "COMPLETED", notes: "Replaced pads" })
  })

  it("lets a technician record a no-show once the time has passed", async () => {
    const s = await setup()
    as(s.u2.user.id)
    expect((await patch(s.job2.id, { status: "NO_SHOW" })).status).toBe(200)
  })

  it("refuses everything that is the manager's call: moving, reassigning, cancelling, prices, contacting", async () => {
    const s = await setup()
    as(s.u1.user.id)
    const attempts: unknown[] = [
      { status: "CANCELLED", cancelReason: "no" },
      { status: "CONFIRMED" },
      { technicianId: s.t2.id },
      { technicianId: null },
      { scheduledAt: new Date(Date.now() + 24 * HOUR).toISOString() },
      { durationMins: 30 },
      { totalPrice: 1 },
      { finalInvoiceValue: 1 },
      { contacted: true },
      { status: "COMPLETED", totalPrice: 5 },
    ]
    for (const body of attempts) expect((await patch(s.job1.id, body)).status, JSON.stringify(body)).toBe(403)
    expect(await prisma.booking.findUniqueOrThrow({ where: { id: s.job1.id } })).toMatchObject({ status: "CONFIRMED", technicianId: s.t1.id })
  })

  it("can't touch anyone else's job, or an unassigned one", async () => {
    const s = await setup()
    as(s.u1.user.id)
    expect((await patch(s.job2.id, { status: "IN_PROGRESS" })).status).toBe(404)
    expect((await patch(s.free.id, { status: "IN_PROGRESS" })).status).toBe(404)
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: s.job2.id } })).status).toBe("CONFIRMED")
  })

  it("a login with no technician link can't update anything", async () => {
    const s = await setup()
    as(s.unlinked.user.id)
    expect((await patch(s.job1.id, { status: "IN_PROGRESS" })).status).toBe(404)
  })

  it("a manager can still do all of it", async () => {
    const s = await setup()
    as(s.manager.user.id)
    expect((await patch(s.job1.id, { technicianId: s.t2.id, allowOverlap: true, notes: "moved" })).status).toBe(200)
    expect((await patch(s.free.id, { status: "CANCELLED", cancelReason: "customer rang" })).status).toBe(200)
  })

  it("a view-only role can't update, even its own", async () => {
    const s = await setup()
    const viewer = await makeStaff(PREFIX, s.orgId, { key: "viewer", permissions: ["bookings.viewOwn"], locations: [s.gid] })
    await prisma.technician.update({ where: { id: s.t1.id }, data: { userId: viewer.user.id } })
    as(viewer.user.id)
    expect((await patch(s.job1.id, { status: "IN_PROGRESS" })).status).toBe(403)
  })
})

describe("the diary", () => {
  const diary = async (qs = "") => (await diaryGet(req(`diary${qs}`))).json() as Promise<{ bookings: { customerName: string | null }[]; technicians: { id: string }[]; capacity: unknown }>

  it("shows a technician their own column only, whatever they ask for", async () => {
    const s = await setup()
    as(s.u1.user.id)
    const body = await diary(`?technicianId=${s.t2.id}`) // trying to look at Tom's column
    expect(names(body)).toEqual(["Customer One"])
    expect(body.technicians.map((t) => t.id)).toEqual([s.t1.id])
  })

  it("shows an unlinked technician login an empty diary, and a manager everything", async () => {
    const s = await setup()
    as(s.unlinked.user.id)
    expect((await diary()).bookings).toEqual([])
    as(s.manager.user.id)
    const all = await diary()
    expect(names(all)).toEqual(["Customer One", "Customer Three", "Customer Two"])
    expect(all.technicians).toHaveLength(2)
  })
})

describe("the technician list and linking a login", () => {
  const list = async () => (await techniciansGet(req("technicians"))).json() as Promise<{ technicians: { id: string; name: string; login?: { id: string } | null }[]; people?: { id: string }[] }>
  const link = (id: string, userId: string | null) => technicianPatch(req("x", json("PATCH", { userId })), p({ id }))

  it("a technician sees only themselves; a manager sees everyone, each one's login, and who could be linked", async () => {
    const s = await setup()
    as(s.u1.user.id)
    const mine = await list()
    expect(mine.technicians.map((t) => t.id)).toEqual([s.t1.id])
    expect(mine.technicians[0]).not.toHaveProperty("login")
    expect(mine.people).toBeUndefined()

    as(s.manager.user.id)
    const all = await list()
    expect(all.technicians.map((t) => t.id).sort()).toEqual([s.t1.id, s.t2.id].sort())
    expect(all.technicians.find((t) => t.id === s.t1.id)?.login).toMatchObject({ id: s.u1.user.id })
    expect(all.people?.map((x) => x.id)).toEqual(expect.arrayContaining([s.u1.user.id, s.u2.user.id, s.unlinked.user.id, s.manager.user.id]))
  })

  it("a manager links a person who works here, which gives them that technician's jobs", async () => {
    const s = await setup()
    as(s.manager.user.id)
    const res = await link(s.t1.id, s.unlinked.user.id)
    expect(res.status).toBe(200)
    expect((await res.json()).technician.login).toMatchObject({ id: s.unlinked.user.id })

    as(s.unlinked.user.id)
    expect(names(await (await bookingsGet(req("bookings"))).json())).toEqual(["Customer One"])
    // And the previous login no longer does.
    as(s.u1.user.id)
    expect((await (await bookingsGet(req("bookings"))).json()).bookings).toEqual([])
  })

  it("unlinks with null", async () => {
    const s = await setup()
    as(s.manager.user.id)
    expect((await link(s.t1.id, null)).status).toBe(200)
    expect((await prisma.technician.findUniqueOrThrow({ where: { id: s.t1.id } })).userId).toBeNull()
  })

  it("refuses a stranger, someone at another business, a second technician for the same person, and a made-up id", async () => {
    const s = await setup()
    const elsewhere = await makeGarage(PREFIX, { key: "rival" })
    const otherBranchOnly = await (async () => {
      const loc = await makeLocation(PREFIX, s.orgId, { key: "far" })
      return makeStaff(PREFIX, s.orgId, { key: "far-staff", role: "staff", locations: [loc.id] })
    })()
    as(s.manager.user.id)
    expect((await link(s.t1.id, elsewhere.user.id)).status).toBe(400)
    expect((await link(s.t1.id, otherBranchOnly.user.id)).status).toBe(400) // same business, but not at this location
    expect((await link(s.t1.id, "no-such-user")).status).toBe(400)
    const dup = await link(s.t2.id, s.u1.user.id) // Tess is already Tess Tech
    expect(dup.status).toBe(409)
    expect((await prisma.technician.findUniqueOrThrow({ where: { id: s.t2.id } })).userId).toBe(s.u2.user.id)
  })

  it("won't link a suspended person or one whose access was removed", async () => {
    const s = await setup()
    await prisma.membership.update({ where: { id: s.unlinked.membership.id }, data: { status: "SUSPENDED" } })
    as(s.manager.user.id)
    expect((await link(s.t1.id, s.unlinked.user.id)).status).toBe(400)
  })

  it("only someone who manages technicians can link", async () => {
    const s = await setup()
    as(s.u1.user.id)
    expect((await link(s.t1.id, s.unlinked.user.id)).status).toBe(403)
    const desk = await makeStaff(PREFIX, s.orgId, { key: "desk", permissions: ["bookings.view"], locations: [s.gid] })
    as(desk.user.id)
    expect((await link(s.t1.id, s.unlinked.user.id)).status).toBe(403)
  })

  it("can't link a technician of another location", async () => {
    const s = await setup()
    const other = await makeGarage(PREFIX, { key: "rival" })
    const theirs = await prisma.technician.create({ data: { garageId: other.garage.id, name: "Rival Tech" } })
    as(s.manager.user.id)
    expect((await link(theirs.id, s.manager.user.id)).status).toBe(404)
  })
})

describe("the dashboard", () => {
  const overview = async () => (await overviewGet(req("overview"))).json() as Promise<any>

  it("shows a technician their own jobs and hides takings, enquiries, reviews, messages and billing", async () => {
    const s = await setup()
    await prisma.review.create({ data: { garageId: s.gid, bookingId: s.job1.id, customerName: "Customer One", rating: 5, comment: "Great job, really pleased with the work." } })
    await prisma.organisation.update({ where: { id: s.orgId }, data: { leadCredits: 9 } })

    as(s.u1.user.id)
    const tech = await overview()
    expect(tech.sees).toEqual({ bookings: true, enquiries: false, reviews: false, messages: false, billing: false, profile: false, insights: false })
    expect(tech.plan.credits).toBe(0)
    expect(tech.pendingEnquiries).toBe(0)
    expect(tech.unrepliedReviews).toBe(0)
    expect(tech.todayBookings.every((b: { customer: string }) => b.customer === "Customer One")).toBe(true)

    as(s.manager.user.id)
    const mgr = await overview()
    expect(mgr.todayBookings.length).toBeGreaterThan(1)
  })

  it("shows the owner everything, including the plan and credits", async () => {
    const s = await setup()
    await prisma.organisation.update({ where: { id: s.orgId }, data: { leadCredits: 9 } })
    as(s.user.id)
    const owner = await overview()
    expect(owner.sees).toEqual({ bookings: true, enquiries: true, reviews: true, messages: true, billing: true, profile: true, insights: true })
    expect(owner.plan.credits).toBe(9)
  })

  it("keeps takings for roles that may see insights: everyone else gets the counts but no money", async () => {
    const s = await setup()
    await makeWalkInBooking(s.gid, { status: "COMPLETED", source: "MARKETPLACE", totalPrice: 250, finalInvoiceValue: 250, scheduledAt: new Date(Date.now() - 2 * HOUR), customerName: "Paid Customer" })
    const desk = await makeStaff(PREFIX, s.orgId, { key: "desk", permissions: ["bookings.view"], locations: [s.gid] })
    const analyst = await makeStaff(PREFIX, s.orgId, { key: "analyst", permissions: ["bookings.view", "insights.view"], locations: [s.gid] })

    as(desk.user.id)
    const plain = await overview()
    expect(plain.sees.insights).toBe(false)
    expect(plain.marketplace.fiv).toBe(0)
    expect(plain.marketplace.created + plain.marketplace.attended).toBeGreaterThan(0) // the counts are still there
    expect(JSON.stringify(plain)).not.toContain("250")

    as(analyst.user.id)
    const full = await overview()
    expect(full.sees.insights).toBe(true)
    expect(full.marketplace.fiv).toBe(250)
  })

  it("a role with no booking access at all sees no bookings on the dashboard", async () => {
    const s = await setup()
    const writer = await makeStaff(PREFIX, s.orgId, { key: "writer", permissions: ["profile.edit"], locations: [s.gid] })
    as(writer.user.id)
    const body = await overview()
    expect(body.sees.bookings).toBe(false)
    expect(body.todayBookings).toEqual([])
    expect(body.weekAhead).toBe(0)
  })
})
