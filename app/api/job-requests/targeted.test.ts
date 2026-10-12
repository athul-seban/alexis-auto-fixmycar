import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { POST } from "./route"
import { findMatchingJobRequestsForGarage, jobMatchesGarage } from "@/lib/job-matching"
import { garageCanSeeJob } from "@/lib/portal/enquiries"
import { cleanupPrefix, makeGarage } from "@/test/fixtures"

vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }))

const mail = vi.mocked(sendMail)
const PREFIX = "targetedjob-"

const body = (over: object = {}) => ({
  guestName: "Guest Person",
  guestEmail: `${PREFIX}guest@example.com`,
  guestPhone: "07123456789",
  registration: "AB12CDE",
  make: "Ford",
  model: "Focus",
  year: 2019,
  serviceType: "MOT",
  description: "Needs an MOT test please",
  city: `${PREFIX}city`,
  postcode: "ZZ9 1AB",
  ...over,
})
const post = (over?: object) =>
  POST(new Request("http://x/api/job-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body(over)) }))

beforeEach(async () => {
  mail.mockClear()
  await cleanupPrefix(PREFIX)
  await prisma.jobRequest.deleteMany({ where: { guestEmail: { startsWith: PREFIX } } })
})
afterAll(async () => {
  await prisma.jobRequest.deleteMany({ where: { guestEmail: { startsWith: PREFIX } } })
  await cleanupPrefix(PREFIX)
})

describe("POST /api/job-requests with garageSlug", () => {
  it("is seen by the named garage wherever it is, and by no other garage, even one in the same area", async () => {
    // Both garages share the job's area (makeGarage uses the prefix's city), so only targeting separates them.
    const target = await makeGarage(PREFIX, { key: "target" })
    const bystander = await makeGarage(PREFIX, { key: "bystander" })
    const res = await post({ garageSlug: target.garage.slug, city: "Far Away Town", postcode: "QQ1 1QQ" })
    expect(res.status).toBe(201)
    const { jobRequest, matchedGarageCount } = await res.json()
    expect(matchedGarageCount).toBe(1)
    expect((await prisma.jobRequest.findUniqueOrThrow({ where: { id: jobRequest.id } })).targetGarageId).toBe(target.garage.id)

    expect((await findMatchingJobRequestsForGarage(target.garage)).map((j) => j.id)).toContain(jobRequest.id)
    expect((await findMatchingJobRequestsForGarage(bystander.garage)).map((j) => j.id)).not.toContain(jobRequest.id)
    expect(await garageCanSeeJob(target.garage, jobRequest.id)).toBe(true)
    expect(await garageCanSeeJob(bystander.garage, jobRequest.id)).toBe(false)
  })

  it("still goes to every matching garage when no garage is named", async () => {
    const a = await makeGarage(PREFIX, { key: "a" })
    const b = await makeGarage(PREFIX, { key: "b" })
    const res = await post({ city: a.garage.city })
    const { jobRequest, matchedGarageCount } = await res.json()
    expect(matchedGarageCount).toBe(2)
    expect((await prisma.jobRequest.findUniqueOrThrow({ where: { id: jobRequest.id } })).targetGarageId).toBeNull()
    for (const g of [a, b]) expect((await findMatchingJobRequestsForGarage(g.garage)).map((j) => j.id)).toContain(jobRequest.id)
  })

  it("rejects a garage that is unknown, not approved, or doesn't offer the service", async () => {
    const pending = await makeGarage(PREFIX, { key: "pending", status: "PENDING" })
    const noMot = await makeGarage(PREFIX, { key: "nomot", services: ["TYRES"] })
    expect((await post({ garageSlug: "no-such-garage" })).status).toBe(404)
    expect((await post({ garageSlug: pending.garage.slug })).status).toBe(404)
    expect((await post({ garageSlug: noMot.garage.slug })).status).toBe(400)
    expect(await prisma.jobRequest.count({ where: { guestEmail: { startsWith: PREFIX } } })).toBe(0)
  })

  it("emails the garage only if it hasn't switched new quote requests off", async () => {
    const on = await makeGarage(PREFIX, { key: "on" })
    const off = await makeGarage(PREFIX, { key: "off", portalSettings: JSON.stringify({ notifications: { emailEnquiry: false } }) })

    await post({ garageSlug: on.garage.slug })
    expect(mail.mock.calls.map((c) => c[0].to)).toContain(on.garage.email)

    mail.mockClear()
    await post({ garageSlug: off.garage.slug })
    expect(mail.mock.calls.map((c) => c[0].to)).not.toContain(off.garage.email)
  })
})

describe("jobMatchesGarage with a targeted job", () => {
  const job = { city: "Elsewhere", postcode: "AA1 1AA", serviceType: "MOT", isMobilePreferred: true, targetGarageId: "g1" }
  const garage = { id: "g1", city: "Leeds", postcode: "LS1 1AA", services: JSON.stringify(["MOT"]), isMobile: false }

  it("matches only the named garage, ignoring area and mobile preference", () => {
    expect(jobMatchesGarage(job, garage)).toBe(true)
    expect(jobMatchesGarage(job, { ...garage, id: "g2" })).toBe(false)
    expect(jobMatchesGarage(job, { ...garage, services: JSON.stringify(["TYRES"]) })).toBe(false)
  })
})
