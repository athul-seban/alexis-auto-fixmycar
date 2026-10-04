import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET } from "./route"
import { PATCH } from "./[kind]/[id]/route"
import { areaFor, cleanupPrefix, makeGarage, makeOwner } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "enqtest-"
const asUser = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE" } } as any)
const get = (qs = "") => GET(new Request(`http://localhost/api/garage/enquiries${qs ? `?${qs}` : ""}`))
const patch = (kind: string, id: string, body: unknown) =>
  PATCH(new Request("http://x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ kind, id }) })

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

let n = 0
const makeJob = (over: object = {}) =>
  prisma.jobRequest.create({
    data: {
      token: `${PREFIX}tok-${n++}-${Math.random().toString(36).slice(2)}`,
      guestName: "Gary Guest", guestEmail: `${PREFIX}gary${n}@example.com`, guestPhone: "07700900777",
      registration: "GU12 EST", make: "Audi", model: "A3", year: 2017, serviceType: "MOT",
      description: "Needs an MOT test please", city: areaFor(PREFIX).city, postcode: areaFor(PREFIX).postcode, ...over,
    },
  })
const makeQuote = (garageId: string, ownerId: string, vehicleId: string, over: object = {}) =>
  prisma.quote.create({ data: { ownerId, vehicleId, garageId, serviceType: "BRAKES", description: "Front brakes squealing", status: "PENDING", ...over } })

describe("GET /api/garage/enquiries", () => {
  it("sorts quote requests into new / estimates / closed and counts them", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const { user: owner, vehicle } = await makeOwner(PREFIX)
    await makeQuote(garage.id, owner.id, vehicle.id, { description: "pending one" })
    await makeQuote(garage.id, owner.id, vehicle.id, { status: "SENT", price: 120, description: "sent one" })
    await makeQuote(garage.id, owner.id, vehicle.id, { status: "ACCEPTED", price: 90, description: "accepted one" })
    asUser(user.id)

    const all = await (await get("stage=all")).json()
    expect(all.counts).toEqual({ new: 1, estimates: 1, closed: 1, all: 3 })

    const news = await (await get("stage=new")).json()
    expect(news.enquiries.map((e: any) => e.description)).toEqual(["pending one"])
    expect(news.enquiries[0]).toMatchObject({ kind: "QUOTE", stage: "new", status: "PENDING", canBook: false, canMessage: true })

    const est = (await (await get("stage=estimates")).json()).enquiries[0]
    expect(est).toMatchObject({ status: "SENT", myPrice: 120, canBook: true })
    expect(est.vehicle).toMatchObject({ vrm: "AB12CDE", make: "Ford" })
    expect(est.customer.name).toBeTruthy()
  })

  it("lists matching guest job leads without exposing the token or email", async () => {
    const { user } = await makeGarage(PREFIX)
    const job = await makeJob()
    await makeJob({ serviceType: "TYRES", description: "not a service we offer here" }) // services don't match
    await makeJob({ city: "Elsewhere", postcode: "QQ1 1QQ", description: "wrong area" })
    asUser(user.id)

    const body = await (await get("stage=new")).json()
    expect(body.enquiries).toHaveLength(1)
    const e = body.enquiries[0]
    expect(e).toMatchObject({ kind: "JOB", id: job.id, status: "NEW", canMessage: false, canBook: false })
    expect(e.location).toEqual({ city: areaFor(PREFIX).city, postcode: areaFor(PREFIX).postcode })
    expect(e.customer).toEqual({ name: "Gary Guest", phone: "07700900777" })
    expect(JSON.stringify(body)).not.toContain(job.token)
    expect(JSON.stringify(body)).not.toContain(job.guestEmail)
  })

  it("moves a job to estimates once priced, and to closed when accepted or declined", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const open = await makeJob({ description: "priced job" })
    const won = await makeJob({ description: "won job" })
    const lost = await makeJob({ description: "lost job" })
    await prisma.jobResponse.create({ data: { jobRequestId: open.id, garageId: garage.id, price: 70 } })
    await prisma.jobResponse.create({ data: { jobRequestId: won.id, garageId: garage.id, price: 80, status: "ACCEPTED" } })
    await prisma.jobResponse.create({ data: { jobRequestId: lost.id, garageId: garage.id, price: 90, status: "DECLINED" } })
    await prisma.jobRequest.updateMany({ where: { id: { in: [won.id, lost.id] } }, data: { status: "BOOKED" } })
    asUser(user.id)

    const body = await (await get("stage=all&pageSize=50")).json()
    const byDesc = Object.fromEntries(body.enquiries.map((e: any) => [e.description, e]))
    expect(byDesc["priced job"]).toMatchObject({ stage: "estimates", status: "SENT", myPrice: 70, canBook: true })
    expect(byDesc["won job"]).toMatchObject({ stage: "closed", status: "ACCEPTED" })
    expect(byDesc["lost job"]).toMatchObject({ stage: "closed", status: "DECLINED" })
  })

  it("never shows another garage's responses and hides marketplace leads from non-live garages", async () => {
    const mine = await makeGarage(PREFIX, { key: "mine" })
    const other = await makeGarage(PREFIX, { key: "other" })
    const job = await makeJob()
    await prisma.jobResponse.create({ data: { jobRequestId: job.id, garageId: other.garage.id, price: 1 } })
    asUser(mine.user.id)
    const seen = (await (await get("stage=all")).json()).enquiries.find((e: any) => e.id === job.id)
    expect(seen).toMatchObject({ status: "NEW", myPrice: null, responseId: null })

    const pending = await makeGarage(PREFIX, { key: "pending", status: "PENDING" })
    asUser(pending.user.id)
    expect((await (await get("stage=all")).json()).enquiries).toEqual([])
  })

  it("filters by kind and text, paginates, and validates input", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const { user: owner, vehicle } = await makeOwner(PREFIX)
    await makeJob({ description: "gearbox whine" })
    await makeQuote(garage.id, owner.id, vehicle.id, { description: "squeaky brakes" })
    asUser(user.id)

    expect((await (await get("stage=all&kind=JOB")).json()).enquiries).toHaveLength(1)
    expect((await (await get("stage=all&kind=QUOTE")).json()).enquiries).toHaveLength(1)
    expect((await (await get("stage=all&q=GEARBOX")).json()).enquiries).toHaveLength(1)
    expect((await (await get("stage=all&q=ab12cde")).json()).enquiries).toHaveLength(1) // quote's vehicle VRM
    const page = await (await get("stage=all&pageSize=10&page=2")).json()
    expect(page).toMatchObject({ page: 2, total: 2, totalPages: 1, enquiries: [] })

    expect((await get("stage=weird")).status).toBe(400)
    expect((await get("pageSize=7")).status).toBe(400)
  })
})

describe("PATCH /api/garage/enquiries/[kind]/[id]", () => {
  it("marks a quote contacted, declines an unanswered one, and can restore it", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const { user: owner, vehicle } = await makeOwner(PREFIX)
    const quote = await makeQuote(garage.id, owner.id, vehicle.id)
    asUser(user.id)

    expect((await patch("quote", quote.id, { contacted: true })).status).toBe(200)
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).contactedAt).not.toBeNull()

    expect((await patch("quote", quote.id, { ignored: true })).status).toBe(200)
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("REJECTED")
    expect((await (await get("stage=closed")).json()).enquiries[0]).toMatchObject({ ignored: true, contacted: true })

    expect((await patch("quote", quote.id, { ignored: false })).status).toBe(200)
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("PENDING")
  })

  it("won't decline a quote that's already been priced", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const { user: owner, vehicle } = await makeOwner(PREFIX)
    const quote = await makeQuote(garage.id, owner.id, vehicle.id, { status: "SENT", price: 50 })
    asUser(user.id)
    expect((await patch("quote", quote.id, { ignored: true })).status).toBe(409)
  })

  it("tracks job leads lazily in GarageLead: ignore, contact, and back to pristine", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const job = await makeJob()
    asUser(user.id)
    const lead = () => prisma.garageLead.findUnique({ where: { garageId_jobRequestId: { garageId: garage.id, jobRequestId: job.id } } })

    expect(await lead()).toBeNull() // "new" = no row
    await patch("job", job.id, { ignored: true })
    expect(await lead()).toMatchObject({ status: "IGNORED", contactedAt: null })
    expect((await (await get("stage=closed")).json()).enquiries[0]).toMatchObject({ id: job.id, ignored: true })

    await patch("job", job.id, { contacted: true })
    expect(await lead()).toMatchObject({ status: "IGNORED" })
    expect((await lead())!.contactedAt).not.toBeNull()

    await patch("job", job.id, { ignored: false })
    expect(await lead()).toMatchObject({ status: "CONTACTED" })

    await patch("job", job.id, { contacted: false })
    expect(await lead()).toBeNull()
    expect((await (await get("stage=new")).json()).enquiries[0]).toMatchObject({ id: job.id, contacted: false })
  })

  it("404s for other garages' quotes, unrelated jobs and unknown kinds", async () => {
    const mine = await makeGarage(PREFIX, { key: "mine" })
    const other = await makeGarage(PREFIX, { key: "other" })
    const { user: owner, vehicle } = await makeOwner(PREFIX)
    const theirs = await makeQuote(other.garage.id, owner.id, vehicle.id)
    const faraway = await makeJob({ city: "Elsewhere", postcode: "QQ1 1QQ" })
    asUser(mine.user.id)

    expect((await patch("quote", theirs.id, { contacted: true })).status).toBe(404)
    expect((await patch("job", faraway.id, { ignored: true })).status).toBe(404)
    expect((await patch("widget", "x", { ignored: true })).status).toBe(404)
    expect((await patch("quote", theirs.id, {})).status).toBe(400)
  })

  it("blocks writes for a suspended garage", async () => {
    const { user, garage } = await makeGarage(PREFIX, { status: "SUSPENDED" })
    const { user: owner, vehicle } = await makeOwner(PREFIX)
    const quote = await makeQuote(garage.id, owner.id, vehicle.id)
    asUser(user.id)
    expect((await patch("quote", quote.id, { contacted: true })).status).toBe(403)
  })
})
