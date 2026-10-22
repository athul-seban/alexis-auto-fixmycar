import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { cleanupPrefix, makeGarage, makeLocation, makeStaff } from "@/test/fixtures"
import { findMatchingGaragesForJob, findMatchingJobRequestsForGarage } from "@/lib/job-matching"
import { businessKey, canBusinessAnswer, dedupeByBusiness, locationTier, pickLocation, wonTheLead, type RoutableGarage } from "@/lib/org/lead-routing"
import { POST as respond } from "../../../app/api/job-requests/[id]/respond/route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue({ success: true }) }))

const g = (id: string, over: Partial<RoutableGarage> = {}): RoutableGarage => ({ id, organisationId: "org-1", city: "Leeds", postcode: "LS1 1AA", averageRating: 4, ...over })

describe("locationTier", () => {
  const job = { city: "Leeds", postcode: "LS1 4AB" }
  it("ranks how much of the area agrees", () => {
    expect(locationTier(job, g("a", { postcode: "LS1 9ZZ" }))).toBe(0) // same postcode district
    expect(locationTier(job, g("b", { postcode: "LS12 1AA" }))).toBe(1) // same first three characters
    expect(locationTier(job, g("c", { postcode: "LS2 1AA" }))).toBe(2) // same city only
    expect(locationTier(job, g("d", { postcode: "BD1 1AA", city: "Bradford" }))).toBe(3)
  })
  it("ignores case and spacing in postcodes and cities", () => {
    expect(locationTier({ city: "LEEDS", postcode: "ls14ab" }, g("a", { postcode: "LS1 9ZZ" }))).toBe(0)
    expect(locationTier({ city: "leeds city centre", postcode: "ZZ9 9ZZ" }, g("a", { city: "Leeds", postcode: "LS1 9ZZ" }))).toBe(2)
  })
})

describe("pickLocation", () => {
  const job = { city: "Leeds", postcode: "LS1 4AB" }
  it("prefers the closer location, then the better rated, then the lower id", () => {
    const near = g("near", { postcode: "LS1 9ZZ", averageRating: 3 })
    const far = g("far", { postcode: "LS2 1AA", averageRating: 5 })
    expect(pickLocation(job, [far, near])?.id).toBe("near")
    const a = g("a", { postcode: "LS1 2AA", averageRating: 4 })
    const b = g("b", { postcode: "LS1 3AA", averageRating: 4.5 })
    expect(pickLocation(job, [a, b])?.id).toBe("b")
    const c = g("c", { postcode: "LS1 5AA", averageRating: 4 })
    expect(pickLocation(job, [c, a])?.id).toBe("a")
  })
  it("is null with no candidates and the only one when there is one", () => {
    expect(pickLocation(job, [])).toBeNull()
    expect(pickLocation(job, [g("only")])?.id).toBe("only")
  })
  it("gives the same answer whatever order the candidates come in (property)", () => {
    const pool = ["LS1 1AA", "LS1 2AA", "LS12 3AA", "LS2 4AA", "BD1 1AA", "HG1 1AA"].map((pc, i) => g(`id${i}`, { postcode: pc, averageRating: [4, 4, 5, 3, 5, 2][i], city: i === 4 ? "Bradford" : "Leeds" }))
    const expected = pickLocation(job, pool)!.id
    for (let n = 0; n < 200; n++) {
      const shuffled = [...pool].sort(() => Math.random() - 0.5)
      expect(pickLocation(job, shuffled)!.id).toBe(expected)
    }
  })
})

describe("dedupeByBusiness", () => {
  const job = { city: "Leeds", postcode: "LS1 4AB" }
  it("keeps one location per business and every independent garage", () => {
    const a1 = g("a1", { organisationId: "A", postcode: "LS1 1AA" })
    const a2 = g("a2", { organisationId: "A", postcode: "LS2 1AA" })
    const b1 = g("b1", { organisationId: "B", postcode: "LS1 2AA" })
    const solo1 = g("solo1", { organisationId: null })
    const solo2 = g("solo2", { organisationId: null })
    const out = dedupeByBusiness(job, [a2, b1, a1, solo1, solo2])
    expect(out.map((x) => x.id)).toEqual(["b1", "a1", "solo1", "solo2"]) // original order, winners only
  })
  it("a garage with no business is its own business", () => {
    expect(businessKey(g("x", { organisationId: null }))).toBe("garage:x")
    expect(businessKey(g("x", { organisationId: "o" }))).toBe("o")
  })
  it("exactly one winner per business however the input is shuffled (property)", () => {
    const pool = Array.from({ length: 12 }, (_, i) => g(`g${i}`, { organisationId: i % 4 === 3 ? null : `org${i % 3}`, postcode: ["LS1 1AA", "LS2 1AA", "LS12 1AA", "BD1 1AA"][i % 4], averageRating: (i * 7) % 5 }))
    const baseline = new Set(dedupeByBusiness(job, pool).map((x) => x.id))
    for (let n = 0; n < 100; n++) {
      const shuffled = [...pool].sort(() => Math.random() - 0.5)
      const out = dedupeByBusiness(job, shuffled)
      expect(new Set(out.map((x) => x.id))).toEqual(baseline)
      expect(new Set(out.map(businessKey)).size).toBe(out.length)
    }
  })
})

// ---- against the database -----------------------------------------------------------------------------------------

const PREFIX = "leadroute-"
const mockSession = vi.mocked(getServerSession)
const as = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE" } } as never)
const CITY = `${PREFIX}city`
const POSTCODE_AREA = "ZQ7" // unlikely to collide with other test files' areas

const makeJob = (over: object = {}) =>
  prisma.jobRequest.create({
    data: {
      token: `${PREFIX}tok-${Math.random().toString(36).slice(2)}`,
      guestName: "Gary Guest", guestEmail: `${PREFIX}gary@example.com`, guestPhone: "07700900777",
      registration: "GU12EST", make: "Audi", model: "A3", year: 2017, serviceType: "MOT",
      description: "Needs an MOT test please", city: CITY, postcode: `${POSTCODE_AREA} 4AB`, ...over,
    },
  })
const respondAt = (jobId: string, locationId: string, body: unknown = { price: 60 }) =>
  respond(new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json", "x-qmg-location": locationId }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: jobId }) })

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

async function business() {
  const biz = await makeGarage(PREFIX, { key: "main", city: CITY })
  await prisma.garage.update({ where: { id: biz.garage.id }, data: { postcode: `${POSTCODE_AREA} 9ZZ`, averageRating: 4 } }) // the closest
  const mid = await makeLocation(PREFIX, biz.organisation!.id, { key: "mid", city: CITY, postcode: "ZQ72 1AA", averageRating: 5 })
  const far = await makeLocation(PREFIX, biz.organisation!.id, { key: "far", city: CITY, postcode: "ZQ9 1AA", averageRating: 5 })
  const main = await prisma.garage.findUniqueOrThrow({ where: { id: biz.garage.id } })
  return { ...biz, garage: main, mid, far }
}

describe("pushing a job to garages", () => {
  it("tells a business once, about its closest matching location, and still tells other businesses", async () => {
    const b = await business()
    const other = await makeGarage(PREFIX, { key: "indep", city: CITY })
    const matches = await findMatchingGaragesForJob({ city: CITY, postcode: `${POSTCODE_AREA} 4AB`, serviceType: "MOT" })
    const ids = matches.map((m) => m.id)
    expect(ids.filter((id) => [b.garage.id, b.mid.id, b.far.id].includes(id))).toEqual([b.garage.id])
    expect(ids).toContain(other.garage.id)
  })

  it("picks the next closest location when the closest doesn't offer the service", async () => {
    const b = await business()
    await prisma.garage.update({ where: { id: b.garage.id }, data: { services: JSON.stringify(["TYRES"]) } })
    const matches = await findMatchingGaragesForJob({ city: CITY, postcode: `${POSTCODE_AREA} 4AB`, serviceType: "MOT" })
    expect(matches.filter((m) => [b.garage.id, b.mid.id, b.far.id].includes(m.id)).map((m) => m.id)).toEqual([b.mid.id])
  })

  it("locations that aren't live don't compete", async () => {
    const b = await business()
    await prisma.garage.update({ where: { id: b.garage.id }, data: { status: "PENDING" } })
    const matches = await findMatchingGaragesForJob({ city: CITY, postcode: `${POSTCODE_AREA} 4AB`, serviceType: "MOT" })
    expect(matches.filter((m) => [b.garage.id, b.mid.id, b.far.id].includes(m.id)).map((m) => m.id)).toEqual([b.mid.id])
  })

  it("a job aimed at one location by name goes to that location, wherever it is in the business", async () => {
    const b = await business()
    const matches = await findMatchingGaragesForJob({ city: CITY, postcode: `${POSTCODE_AREA} 4AB`, serviceType: "MOT", targetGarageId: b.far.id })
    expect(matches.map((m) => m.id)).toEqual([b.far.id])
  })
})

describe("listing jobs in the portal", () => {
  it("only the location that should handle a job lists it", async () => {
    const b = await business()
    const job = await makeJob()
    const listed = async (loc: { id: string }) => (await findMatchingJobRequestsForGarage((await prisma.garage.findUniqueOrThrow({ where: { id: loc.id } })))).some((j) => j.id === job.id)
    expect(await listed(b.garage)).toBe(true)
    expect(await listed(b.mid)).toBe(false)
    expect(await listed(b.far)).toBe(false)
  })

  it("once the business has answered, no other location lists it, but the one that answered still does", async () => {
    const b = await business()
    const job = await makeJob()
    await prisma.jobResponse.create({ data: { jobRequestId: job.id, garageId: b.garage.id, price: 50, status: "SENT" } })
    const listed = async (id: string) => (await findMatchingJobRequestsForGarage(await prisma.garage.findUniqueOrThrow({ where: { id } }))).some((j) => j.id === job.id)
    expect(await listed(b.garage.id)).toBe(true)
    expect(await listed(b.mid.id)).toBe(false)
    expect(await listed(b.far.id)).toBe(false)
  })

  it("a location that answered keeps seeing its own job even if another location would now win", async () => {
    const b = await business()
    const job = await makeJob()
    await prisma.jobResponse.create({ data: { jobRequestId: job.id, garageId: b.far.id, price: 50, status: "SENT" } })
    expect((await findMatchingJobRequestsForGarage(await prisma.garage.findUniqueOrThrow({ where: { id: b.far.id } }))).some((j) => j.id === job.id)).toBe(true)
  })

  it("a targeted job is listed at the targeted location only", async () => {
    const b = await business()
    const job = await makeJob({ targetGarageId: b.far.id })
    const listed = async (id: string) => (await findMatchingJobRequestsForGarage(await prisma.garage.findUniqueOrThrow({ where: { id } }))).some((j) => j.id === job.id)
    expect(await listed(b.far.id)).toBe(true)
    expect(await listed(b.garage.id)).toBe(false)
    expect(await listed(b.mid.id)).toBe(false)
  })

  it("garages of different businesses never affect each other", async () => {
    const b = await business()
    const rival = await makeGarage(PREFIX, { key: "rival", city: CITY })
    const job = await makeJob()
    await prisma.jobResponse.create({ data: { jobRequestId: job.id, garageId: b.garage.id, price: 50, status: "SENT" } })
    expect((await findMatchingJobRequestsForGarage(rival.garage)).some((j) => j.id === job.id)).toBe(true)
  })
})

describe("answering a job", () => {
  it("the right location can answer; another location of the same business can't, before or after", async () => {
    const b = await business()
    const job = await makeJob()
    as(b.user.id) // the Owner works at every location

    const wrong = await respondAt(job.id, b.far.id)
    expect(wrong.status).toBe(403)
    expect((await wrong.json()).code).toBe("NEARER_LOCATION")

    expect((await respondAt(job.id, b.garage.id)).status).toBe(201)

    const after = await respondAt(job.id, b.mid.id)
    expect(after.status).toBe(409)
    expect((await after.json()).code).toBe("BUSINESS_ANSWERED")
    expect(await prisma.jobResponse.count({ where: { jobRequestId: job.id } })).toBe(1)
  })

  it("a location can answer a job aimed at it by name", async () => {
    const b = await business()
    const job = await makeJob({ targetGarageId: b.far.id })
    as(b.user.id)
    expect((await respondAt(job.id, b.far.id)).status).toBe(201)
  })

  it("staff at the nearest location answer; staff at another location are told to leave it", async () => {
    const b = await business()
    const job = await makeJob()
    const farStaff = await makeStaff(PREFIX, b.organisation!.id, { key: "farstaff", permissions: ["enquiries.respond"], locations: [b.far.id] })
    as(farStaff.user.id)
    expect((await respondAt(job.id, b.far.id)).status).toBe(403)
    expect(await prisma.jobResponse.count({ where: { jobRequestId: job.id } })).toBe(0)
  })

  it("an independent garage can still answer a job another business has answered", async () => {
    const b = await business()
    const rival = await makeGarage(PREFIX, { key: "rival", city: CITY })
    const job = await makeJob()
    await prisma.jobResponse.create({ data: { jobRequestId: job.id, garageId: b.garage.id, price: 50, status: "SENT" } })
    as(rival.user.id)
    expect((await respondAt(job.id, rival.garage.id)).status).toBe(201)
  })
})

describe("wonTheLead: two locations answering at the same moment", () => {
  it("the earliest answer wins and every location reaches the same verdict", async () => {
    const b = await business()
    const job = await makeJob()
    const early = await prisma.jobResponse.create({ data: { jobRequestId: job.id, garageId: b.far.id, price: 50, status: "SENT", createdAt: new Date(Date.now() - 5000) } })
    await prisma.jobResponse.create({ data: { jobRequestId: job.id, garageId: b.garage.id, price: 50, status: "SENT" } })
    expect(early.garageId).toBe(b.far.id)
    expect(await wonTheLead(job.id, b.far)).toBe(true)
    expect(await wonTheLead(job.id, b.garage)).toBe(false)
  })

  it("a business with one location, or none, always wins", async () => {
    const solo = await makeGarage(PREFIX, { key: "solo" })
    const legacy = await makeGarage(PREFIX, { key: "legacy", legacy: true })
    const job = await makeJob()
    expect(await wonTheLead(job.id, solo.garage)).toBe(true)
    expect(await wonTheLead(job.id, legacy.garage)).toBe(true)
  })

  it("canBusinessAnswer says the same thing the route does", async () => {
    const b = await business()
    const job = await makeJob()
    const matches = () => true
    expect((await canBusinessAnswer(job, b.garage, matches)).ok).toBe(true)
    const far = await canBusinessAnswer(job, b.far, matches)
    expect(!far.ok && far.reason).toBe("NEARER_LOCATION")
  })
})
