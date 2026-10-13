import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { POST } from "./route"
import { acceptJobResponse } from "@/lib/portal/booking-service"
import { expireDueRequests } from "@/lib/portal/quote-request-service"
import { cleanupPrefix, makeGarage } from "@/test/fixtures"

vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }))

const mail = vi.mocked(sendMail)
const PREFIX = "quotetiming-"
const SERVICES = ["MOT", "BRAKES", "TYRES"]

const body = (over: object = {}) => ({
  guestName: "Guest Person",
  guestEmail: `${PREFIX}guest@example.com`,
  guestPhone: "07123456789",
  registration: "AB12CDE",
  make: "Ford",
  model: "Focus",
  year: 2019,
  services: ["MOT", "BRAKES"],
  description: "MOT and brakes please",
  city: `${PREFIX}city`,
  postcode: "ZZ9 1AB",
  ...over,
})
const post = (over?: object) =>
  POST(new Request("http://x/api/job-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body(over)) }))

const price = (garageId: string, serviceType: string, over: object = {}) =>
  prisma.servicePrice.create({ data: { garageId, serviceType, ...over } })
const garageWith = (settings: object = {}, key = "g") =>
  makeGarage(PREFIX, { key, services: SERVICES, portalSettings: JSON.stringify({ quotes: settings }) })

beforeEach(async () => {
  mail.mockClear()
  await cleanupPrefix(PREFIX)
  await prisma.jobRequest.deleteMany({ where: { guestEmail: { startsWith: PREFIX } } })
})
afterAll(async () => {
  await prisma.jobRequest.deleteMany({ where: { guestEmail: { startsWith: PREFIX } } })
  await cleanupPrefix(PREFIX)
})

describe("quote requests for several works", () => {
  it("answers instantly when the garage has an automatic price for every work", async () => {
    const { garage } = await garageWith()
    await price(garage.id, "MOT", { fixedPrice: 45, autoQuote: true })
    await price(garage.id, "BRAKES", { fixedPrice: 120.5, autoQuote: true })

    const res = await post({ garageSlug: garage.slug })
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json.instantlyQuoted).toBe(true)

    const job = await prisma.jobRequest.findUniqueOrThrow({ where: { id: json.jobRequest.id }, include: { responses: true } })
    expect(job.status).toBe("QUOTED")
    expect(JSON.parse(job.services)).toEqual(["MOT", "BRAKES"])
    expect(job.responses).toHaveLength(1)
    expect(job.responses[0]).toMatchObject({ garageId: garage.id, price: 165.5, source: "AUTO", status: "SENT" })
    expect(JSON.parse(job.responses[0].lineItems!)).toEqual([
      { serviceType: "MOT", price: 45, source: "FIXED" },
      { serviceType: "BRAKES", price: 120.5, source: "FIXED" },
    ])
    // The customer got their price; the garage was not emailed to quote (it has nothing to do).
    expect(mail.mock.calls.map((c) => c[0].to)).not.toContain(garage.email)
    expect(mail.mock.calls.some((c) => c[0].to === `${PREFIX}guest@example.com` && /quote from/i.test(c[0].subject))).toBe(true)
  })

  it("asks the garage to quote by hand within its own time limit when any work lacks an automatic price", async () => {
    const { garage } = await garageWith({ responseHours: 4 })
    await price(garage.id, "MOT", { fixedPrice: 45, autoQuote: true })
    await price(garage.id, "BRAKES", { fixedPrice: 120, autoQuote: false })

    const before = Date.now()
    const json = await (await post({ garageSlug: garage.slug })).json()
    expect(json.instantlyQuoted).toBe(false)

    const job = await prisma.jobRequest.findUniqueOrThrow({ where: { id: json.jobRequest.id }, include: { responses: true } })
    expect(job.status).toBe("OPEN")
    expect(job.responses).toHaveLength(0)
    expect(job.respondBy!.getTime()).toBeGreaterThanOrEqual(before + 4 * 3_600_000 - 1000)
    expect(job.respondBy!.getTime()).toBeLessThanOrEqual(Date.now() + 4 * 3_600_000 + 1000)
    expect(mail.mock.calls.map((c) => c[0].to)).toContain(garage.email)
  })

  it("refuses works the garage doesn't offer", async () => {
    const { garage } = await garageWith()
    const res = await post({ garageSlug: garage.slug, services: ["MOT", "CLUTCH"] })
    expect(res.status).toBe(400)
  })

  it("still accepts a single serviceType from older clients", async () => {
    const { garage } = await garageWith()
    const res = await post({ garageSlug: garage.slug, services: undefined, serviceType: "MOT" })
    expect(res.status).toBe(201)
    const job = await prisma.jobRequest.findFirstOrThrow({ where: { guestEmail: { startsWith: PREFIX } } })
    expect(job.serviceType).toBe("MOT")
    expect(JSON.parse(job.services)).toEqual(["MOT"])
  })
})

describe("missing the quoting deadline", () => {
  const unanswered = async (settings: object) => {
    const { garage } = await garageWith(settings)
    const json = await (await post({ garageSlug: garage.slug })).json()
    await prisma.jobRequest.update({ where: { id: json.jobRequest.id }, data: { respondBy: new Date(Date.now() - 60_000) } })
    mail.mockClear()
    return { garage, jobId: json.jobRequest.id as string }
  }

  it("closes the request and tells the customer, exactly once", async () => {
    const { jobId } = await unanswered({ onExpiry: "EXPIRE" })

    expect(await expireDueRequests({ jobId })).toBe(1)
    const job = await prisma.jobRequest.findUniqueOrThrow({ where: { id: jobId }, include: { responses: true } })
    expect(job.status).toBe("EXPIRED")
    expect(job.responses).toHaveLength(0)
    expect(mail.mock.calls).toHaveLength(1)
    expect(mail.mock.calls[0][0].to).toBe(`${PREFIX}guest@example.com`)

    expect(await expireDueRequests({ jobId })).toBe(0) // already closed: nothing to do, no second email
    expect(mail.mock.calls).toHaveLength(1)
  })

  it("sends the garage's own prices as an estimate when it chose that", async () => {
    const { garage, jobId } = await unanswered({ onExpiry: "ESTIMATE" })
    await price(garage.id, "MOT", { fixedPrice: 45 })
    await price(garage.id, "BRAKES", { priceFrom: 80 })

    await expireDueRequests({ jobId })
    const job = await prisma.jobRequest.findUniqueOrThrow({ where: { id: jobId }, include: { responses: true } })
    expect(job.status).toBe("QUOTED")
    expect(job.responses[0]).toMatchObject({ price: 125, source: "ESTIMATE", status: "SENT" })
    expect(job.responses[0].message).toMatch(/estimate/i)
  })

  it("expires instead when an estimate isn't possible (a work has no price)", async () => {
    const { garage, jobId } = await unanswered({ onExpiry: "ESTIMATE" })
    await price(garage.id, "MOT", { fixedPrice: 45 }) // BRAKES has no price

    await expireDueRequests({ jobId })
    expect((await prisma.jobRequest.findUniqueOrThrow({ where: { id: jobId } })).status).toBe("EXPIRED")
  })

  it("leaves a request alone while the deadline hasn't passed", async () => {
    const { garage } = await garageWith()
    const json = await (await post({ garageSlug: garage.slug })).json()
    expect(await expireDueRequests({ jobId: json.jobRequest.id })).toBe(0)
    expect((await prisma.jobRequest.findUniqueOrThrow({ where: { id: json.jobRequest.id } })).status).toBe("OPEN")
  })

  it("won't let the customer accept a quote that has expired", async () => {
    const { garage } = await garageWith()
    const json = await (await post({ garageSlug: garage.slug })).json()
    const response = await prisma.jobResponse.create({
      data: { jobRequestId: json.jobRequest.id, garageId: garage.id, price: 50, validUntil: new Date(Date.now() - 1000) },
    })
    await expect(acceptJobResponse({ jobRequestId: json.jobRequest.id, jobResponseId: response.id })).rejects.toThrow(/expired/i)
    expect((await prisma.jobRequest.findUniqueOrThrow({ where: { id: json.jobRequest.id } })).status).not.toBe("BOOKED")
  })

  it("carries the line items onto the booking when the customer accepts, which is when details are shared", async () => {
    const { garage } = await garageWith()
    await price(garage.id, "MOT", { fixedPrice: 45, autoQuote: true })
    await price(garage.id, "BRAKES", { fixedPrice: 100, autoQuote: true })
    const json = await (await post({ garageSlug: garage.slug })).json()
    const response = await prisma.jobResponse.findFirstOrThrow({ where: { jobRequestId: json.jobRequest.id } })

    const { booking } = await acceptJobResponse({ jobRequestId: json.jobRequest.id, jobResponseId: response.id })
    expect(booking).toMatchObject({ totalPrice: 145, customerName: "Guest Person", customerPhone: "07123456789", vrm: "AB12CDE" })
    expect(JSON.parse(booking.lineItems!)).toHaveLength(2)
  })
})
