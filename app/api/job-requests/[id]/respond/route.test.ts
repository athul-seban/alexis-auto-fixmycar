import { describe, it, expect, vi, beforeEach, afterAll, afterEach } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { POST } from "./route"
import { areaFor, cleanupPrefix, makeGarage } from "@/test/fixtures"
import { PLANS } from "@/lib/portal/plans"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "respondtest-"
const asUser = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE" } } as any)
const respond = (id: string, body: unknown = { price: 75 }) =>
  POST(new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

const makeJob = (over: object = {}) =>
  prisma.jobRequest.create({
    data: {
      token: `${PREFIX}tok-${Math.random().toString(36).slice(2)}`,
      guestName: "Gary Guest", guestEmail: `${PREFIX}gary@example.com`, guestPhone: "07700900777",
      registration: "GU12EST", make: "Audi", model: "A3", year: 2017, serviceType: "MOT",
      description: "Needs an MOT test please", city: areaFor(PREFIX).city, postcode: areaFor(PREFIX).postcode, ...over,
    },
  })

describe("POST /api/job-requests/[id]/respond — guards", () => {
  it("lets a live, matching garage send a quote and moves the job to QUOTED", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const job = await makeJob()
    asUser(user.id)

    const res = await respond(job.id)
    expect(res.status).toBe(201)
    expect((await prisma.jobRequest.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("QUOTED")
    expect(await prisma.jobResponse.count({ where: { jobRequestId: job.id, garageId: garage.id } })).toBe(1)
    expect((await respond(job.id)).status).toBe(409) // already responded
  })

  it("refuses garages that aren't live", async () => {
    for (const status of ["PENDING", "SUSPENDED"]) {
      const { user } = await makeGarage(PREFIX, { status, key: status })
      const job = await makeJob()
      asUser(user.id)
      const res = await respond(job.id)
      expect(res.status, status).toBe(403)
    }
  })

  it("refuses a job outside the garage's area or services (it was never matched)", async () => {
    const { user } = await makeGarage(PREFIX, { services: ["MOT"] })
    asUser(user.id)
    expect((await respond((await makeJob({ city: "Elsewhere", postcode: "QQ1 1QQ" })).id)).status).toBe(403)
    expect((await respond((await makeJob({ serviceType: "CLUTCH" })).id)).status).toBe(403)
  })

  it("rejects closed jobs and bad bodies", async () => {
    const { user } = await makeGarage(PREFIX)
    asUser(user.id)
    expect((await respond((await makeJob({ status: "BOOKED" })).id)).status).toBe(409)
    expect((await respond((await makeJob()).id, { price: -1 })).status).toBe(400)
  })
})

describe("POST /api/job-requests/[id]/respond — plan limits", () => {
  afterEach(() => {
    delete process.env.PLANS_ENFORCED
  })

  const exhaust = async (garageId: string) => {
    for (let i = 0; i < PLANS.FREE.leadsPerMonth!; i++) {
      const job = await makeJob()
      await prisma.jobResponse.create({ data: { jobRequestId: job.id, garageId, price: 50, status: "SENT" } })
    }
  }

  it("doesn't limit anyone while plans aren't enforced", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    await exhaust(garage.id)
    asUser(user.id)
    expect((await respond((await makeJob()).id)).status).toBe(201)
  })

  it("blocks a free garage past its monthly allowance with a 402 and a code the UI can act on", async () => {
    process.env.PLANS_ENFORCED = "true"
    const { user, garage } = await makeGarage(PREFIX)
    await exhaust(garage.id)
    asUser(user.id)
    const job = await makeJob()
    const res = await respond(job.id)
    expect(res.status).toBe(402)
    expect((await res.json()).code).toBe("LEAD_LIMIT")
    expect(await prisma.jobResponse.count({ where: { jobRequestId: job.id } })).toBe(0)
  })

  it("spends one credit to answer past the allowance, and records it", async () => {
    process.env.PLANS_ENFORCED = "true"
    const { user, garage } = await makeGarage(PREFIX)
    await prisma.garage.update({ where: { id: garage.id }, data: { leadCredits: 2 } })
    await exhaust(garage.id)
    asUser(user.id)
    const job = await makeJob()
    expect((await respond(job.id)).status).toBe(201)
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).leadCredits).toBe(1)
    expect(await prisma.leadCreditTransaction.count({ where: { garageId: garage.id, reason: "LEAD", jobRequestId: job.id } })).toBe(1)
  })

  it("lets a paid plan answer without spending anything", async () => {
    process.env.PLANS_ENFORCED = "true"
    const { user, garage } = await makeGarage(PREFIX)
    await prisma.garage.update({ where: { id: garage.id }, data: { plan: "PREMIUM", subscriptionStatus: "active" } })
    await exhaust(garage.id)
    asUser(user.id)
    expect((await respond((await makeJob()).id)).status).toBe(201)
  })

  it("keeps a running average of how fast the garage answers", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    const job = await makeJob({ createdAt: new Date(Date.now() - 30 * 60_000) })
    asUser(user.id)
    await respond(job.id)
    const g = await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })
    expect(g.responseSamples).toBe(1)
    expect(g.avgResponseMins).toBeGreaterThan(29)
    expect(g.avgResponseMins).toBeLessThan(32)
  })
})
