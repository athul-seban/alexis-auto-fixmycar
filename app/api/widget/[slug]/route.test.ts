import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { GET as getConfig } from "./route"
import { GET as getSlots } from "./slots/route"
import { POST as postBooking } from "./bookings/route"
import { DEFAULT_PORTAL_SETTINGS, serializePortalSettings, type PortalSettings } from "@/lib/portal/portal-settings"
import { addDays, londonWallToUtc, todayLondon } from "@/lib/portal/tz"
import { cleanupPrefix, makeGarage } from "@/test/fixtures"

const sendMail = vi.hoisted(() => vi.fn(async (_m: { to: string; subject: string; html: string }) => ({ success: true })))
vi.mock("@/lib/mail", () => ({ sendMail }))

const PREFIX = "widgettest-"
const ALL_OPEN = Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, { open: true, from: "09:00", to: "17:00" }]))
const DATE = addDays(todayLondon(), 3)
const at = (hhmm: string) => londonWallToUtc(DATE, hhmm)

const settings = (widget: Partial<PortalSettings["widget"]> = {}, extra: Partial<PortalSettings> = {}) =>
  serializePortalSettings({ ...DEFAULT_PORTAL_SETTINGS, ...extra, widget: { ...DEFAULT_PORTAL_SETTINGS.widget, slotMins: 60, leadHours: 0, ...widget } })

const setup = async (opts: { widget?: Partial<PortalSettings["widget"]>; status?: string; hours?: object | null; services?: string[]; key?: string } = {}) => {
  const g = await makeGarage(PREFIX, {
    key: opts.key ?? "w",
    status: opts.status,
    openingHours: opts.hours === undefined ? ALL_OPEN : opts.hours,
    portalSettings: settings(opts.widget),
    services: opts.services ?? ["MOT", "BRAKES"],
  })
  return g
}

const params = (slug: string) => ({ params: Promise.resolve({ slug }) })
const config = (slug: string) => getConfig(new Request("http://x"), params(slug))
const slots = (slug: string, qs: string) => getSlots(new Request(`http://x?${qs}`), params(slug))
let n = 0
const book = (slug: string, body: object = {}, headers: Record<string, string> = {}) =>
  postBooking(
    new Request("http://x", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        service: "MOT", start: at("10:00").toISOString(), name: "Wendy Widget", email: `${PREFIX}cust${n++}@example.com`,
        phone: "07700900123", vrm: "wd19 abc", make: "Kia", model: "Ceed", ...body,
      }),
    }),
    params(slug)
  )

beforeEach(async () => {
  sendMail.mockClear()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("GET /api/widget/[slug] (config)", () => {
  it("returns the public configuration and bookable services with prices", async () => {
    const { garage } = await setup({ widget: { accent: "F97316", autoConfirm: true, successMessage: "See you soon!" } })
    await prisma.servicePrice.createMany({ data: [
      { garageId: garage.id, serviceType: "MOT", priceFrom: 40, priceTo: 54.85, durationMins: 45, notes: "Class 4" },
      { garageId: garage.id, serviceType: "BRAKES", priceFrom: 100, durationMins: 120, isActive: false }, // switched off
    ] })

    const res = await config(garage.slug)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(body.garage).toMatchObject({ name: garage.name, phone: garage.phone })
    expect(body.settings).toMatchObject({ accent: "F97316", autoConfirm: true, successMessage: "See you soon!", slotMins: 60 })
    expect(body.hoursConfigured).toBe(true)
    expect(body.services).toEqual([
      { serviceType: "MOT", label: "MOT Test", durationMins: 45, priceFrom: 40, priceTo: 54.85, priceLabel: "£40 – £54.85", notes: "Class 4" },
    ])
  })

  it("defaults the duration and shows no price when a service has no price row", async () => {
    const { garage } = await setup({ services: ["FULL_SERVICE"] })
    const { services } = await (await config(garage.slug)).json()
    expect(services).toEqual([{ serviceType: "FULL_SERVICE", label: "Full Service", durationMins: 180, priceFrom: null, priceTo: null, priceLabel: null, notes: null }])
  })

  it("is 404 for unknown, pending, suspended and widget-disabled garages", async () => {
    expect((await config("no-such-garage")).status).toBe(404)
    expect((await config((await setup({ status: "PENDING", key: "p" })).garage.slug)).status).toBe(404)
    expect((await config((await setup({ status: "SUSPENDED", key: "s" })).garage.slug)).status).toBe(404)
    expect((await config((await setup({ widget: { enabled: false }, key: "d" })).garage.slug)).status).toBe(404)
  })

  it("reports when opening hours aren't configured, and never leaks private fields", async () => {
    const { garage } = await setup({ hours: null })
    const body = await (await config(garage.slug)).json()
    expect(body.hoursConfigured).toBe(false)
    const text = JSON.stringify(body)
    expect(text).not.toContain(garage.email)
    expect(text).not.toContain("userId")
    expect(text).not.toContain("portalSettings")
  })
})

describe("GET /api/widget/[slug]/slots", () => {
  it("lists hourly slots within opening hours for a 60-minute service", async () => {
    const { garage } = await setup()
    const body = await (await slots(garage.slug, `date=${DATE}&service=MOT`)).json()
    expect(body.date).toBe(DATE)
    expect(body.slots.map((s: any) => s.label)).toEqual(["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"])
    expect(body.slots[1].start).toBe(at("10:00").toISOString())
  })

  it("removes taken, blocked and out-of-capacity slots", async () => {
    const { garage } = await setup()
    await prisma.booking.create({ data: { garageId: garage.id, serviceType: "MOT", status: "CONFIRMED", scheduledAt: at("10:00"), durationMins: 60, totalPrice: 1, customerName: "Taken" } })
    await prisma.diaryBlock.create({ data: { garageId: garage.id, startAt: at("13:00"), endAt: at("15:00"), reason: "Lunch & training" } })

    const labels = (await (await slots(garage.slug, `date=${DATE}&service=MOT`)).json()).slots.map((s: any) => s.label)
    expect(labels).not.toContain("10:00")
    expect(labels).not.toContain("13:00")
    expect(labels).not.toContain("14:00")
    expect(labels).toContain("11:00")
    expect(labels).toContain("15:00")
  })

  it("offers a slot again when a second technician gives spare capacity", async () => {
    const { garage } = await setup()
    await prisma.technician.createMany({ data: [{ garageId: garage.id, name: "A" }, { garageId: garage.id, name: "B" }] })
    await prisma.booking.create({ data: { garageId: garage.id, serviceType: "MOT", status: "CONFIRMED", scheduledAt: at("10:00"), durationMins: 60, totalPrice: 1 } })
    const labels = (await (await slots(garage.slug, `date=${DATE}&service=MOT`)).json()).slots.map((s: any) => s.label)
    expect(labels).toContain("10:00")
  })

  it("returns no slots outside the booking window, in the past, on closed days, or without hours", async () => {
    const { garage } = await setup({ widget: { maxDaysAhead: 5 } })
    const empty = async (date: string) => (await (await slots(garage.slug, `date=${date}&service=MOT`)).json()).slots
    expect(await empty(addDays(todayLondon(), 30))).toEqual([])
    expect(await empty(addDays(todayLondon(), -2))).toEqual([])

    const closed = await setup({ key: "closed", hours: { ...ALL_OPEN, ...Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, { open: false, from: "", to: "" }])) } })
    expect((await (await slots(closed.garage.slug, `date=${DATE}&service=MOT`)).json()).slots).toEqual([])

    const noHours = await setup({ key: "nohours", hours: null })
    expect((await (await slots(noHours.garage.slug, `date=${DATE}&service=MOT`)).json()).slots).toEqual([])
  })

  it("honours the lead time", async () => {
    const { garage } = await setup({ widget: { leadHours: 168, maxDaysAhead: 60 } }) // a week's notice
    expect((await (await slots(garage.slug, `date=${DATE}&service=MOT`)).json()).slots).toEqual([])
  })

  it("validates input and hides unavailable garages", async () => {
    const { garage } = await setup()
    expect((await slots(garage.slug, "date=nope&service=MOT")).status).toBe(400)
    expect((await slots(garage.slug, `date=${DATE}`)).status).toBe(400)
    expect((await slots(garage.slug, `date=${DATE}&service=CLUTCH`)).status).toBe(400) // not offered
    expect((await slots("ghost", `date=${DATE}&service=MOT`)).status).toBe(404)
    expect((await slots(garage.slug, `date=${DATE}&service=MOT`)).headers.get("cache-control")).toBe("no-store")
  })
})

describe("POST /api/widget/[slug]/bookings", () => {
  it("creates a PENDING WIDGET booking with snapshots, notifies the garage and emails the customer", async () => {
    const { garage } = await setup()
    const email = `${PREFIX}create@example.com`
    const res = await book(garage.slug, { email, notes: "Please check the brakes too", name: "Wendy <script>x</script>" })
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body).toMatchObject({ status: "PENDING", scheduledAt: at("10:00").toISOString() })
    expect(body.reference).toMatch(/^QMG-/)

    const b = await prisma.booking.findFirstOrThrow({ where: { garageId: garage.id } })
    expect(b).toMatchObject({ source: "WIDGET", status: "PENDING", ownerId: null, vehicleId: null, customerEmail: email, vrm: "WD19ABC", vehicleMake: "Kia", durationMins: 60, description: "Please check the brakes too" })
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).totalBookings).toBe(1)
    expect(await prisma.notification.count({ where: { garageId: garage.id, type: "BOOKING_CREATED" } })).toBe(1)

    const mails = sendMail.mock.calls.map((c) => c[0])
    expect(mails.find((m) => m.to === email)?.subject).toMatch(/Booking request received/)
    expect(mails.find((m) => m.to === garage.email)?.subject).toMatch(/New booking/)
    // Customer-supplied text is escaped in emails.
    expect(mails.map((m) => m.html).join("")).not.toContain("<script>")
  })

  it("confirms immediately when the garage has auto-confirm on, using the price from Pricing", async () => {
    const { garage } = await setup({ widget: { autoConfirm: true, successMessage: "See you soon!" } })
    await prisma.servicePrice.create({ data: { garageId: garage.id, serviceType: "MOT", priceFrom: 54.85, durationMins: 45 } })
    const res = await book(garage.slug)
    const body = await res.json()
    expect(body).toMatchObject({ status: "CONFIRMED", message: "See you soon!" })
    const b = await prisma.booking.findFirstOrThrow({ where: { garageId: garage.id } })
    expect(b).toMatchObject({ status: "CONFIRMED", totalPrice: 54.85, durationMins: 45 })
  })

  it("won't double-book a slot (409 slot_taken with fresh availability)", async () => {
    const { garage } = await setup()
    expect((await book(garage.slug)).status).toBe(201)

    const clash = await book(garage.slug) // different customer, same time, capacity 1
    const body = await clash.json()
    expect(clash.status).toBe(409)
    expect(body.code).toBe("slot_taken")
    expect(body.slots.map((s: any) => s.label)).not.toContain("10:00")
    expect(body.slots.length).toBeGreaterThan(0)
    expect(await prisma.booking.count({ where: { garageId: garage.id } })).toBe(1)
  })

  it("lets only one of several simultaneous submissions take the last free slot", async () => {
    const { garage } = await setup()
    // Five different people hit "confirm" for the same 10:00 slot at the same instant.
    const results = await Promise.all(Array.from({ length: 5 }, () => book(garage.slug)))
    const statuses = results.map((r) => r.status).sort()

    expect(statuses.filter((s) => s === 201)).toHaveLength(1)
    expect(statuses.filter((s) => s === 409)).toHaveLength(4)
    expect(await prisma.booking.count({ where: { garageId: garage.id } })).toBe(1)

    const lost = results.find((r) => r.status === 409)!
    const body = await lost.json()
    expect(body.code).toBe("slot_taken")
    expect(body.slots.map((s: any) => s.label)).not.toContain("10:00")
  })

  it("rejects times that were never offered (outside hours, off the slot grid, blocked)", async () => {
    const { garage } = await setup()
    await prisma.diaryBlock.create({ data: { garageId: garage.id, startAt: at("14:00"), endAt: at("16:00") } })
    for (const start of [at("07:00"), at("10:30"), at("14:00"), addDays(DATE, -10)].map((d) => (d instanceof Date ? d : londonWallToUtc(d, "10:00")))) {
      expect((await book(garage.slug, { start: start.toISOString() })).status, start.toISOString()).toBe(409)
    }
    expect(await prisma.booking.count({ where: { garageId: garage.id } })).toBe(0)
  })

  it("returns the existing booking for a double-submit instead of creating another", async () => {
    const { garage } = await setup()
    const email = `${PREFIX}double@example.com`
    const first = await (await book(garage.slug, { email })).json()
    const again = await book(garage.slug, { email })
    const body = await again.json()
    expect(again.status).toBe(200)
    expect(body).toMatchObject({ reference: first.reference, duplicate: true })
    expect(await prisma.booking.count({ where: { garageId: garage.id } })).toBe(1)
  })

  it("silently drops honeypot submissions (fake success, nothing stored or emailed)", async () => {
    const { garage } = await setup()
    const res = await book(garage.slug, { website: "http://spam.example.com" })
    expect(res.status).toBe(201)
    expect(await prisma.booking.count({ where: { garageId: garage.id } })).toBe(0)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it("validates the form", async () => {
    const { garage } = await setup()
    const status = async (o: object) => (await book(garage.slug, o)).status
    expect(await status({ name: "A" })).toBe(400)
    expect(await status({ email: "not-an-email" })).toBe(400)
    expect(await status({ phone: "1" })).toBe(400)
    expect(await status({ vrm: "!" })).toBe(400)
    expect(await status({ vrm: "ABCDEFGHIJKLM" })).toBe(400)
    expect(await status({ start: "tomorrow" })).toBe(400)
    expect(await status({ notes: "x".repeat(501) })).toBe(400)
    expect(await status({ service: "CLUTCH" })).toBe(400)
    expect(await status({ service: "" })).toBe(400)

    const bad = await postBooking(new Request("http://x", { method: "POST", body: "not json" }), params(garage.slug))
    expect(bad.status).toBe(400)
    expect(await prisma.booking.count({ where: { garageId: garage.id } })).toBe(0)
  })

  it("is unavailable for pending, suspended and disabled garages", async () => {
    for (const [key, opts] of [["p", { status: "PENDING" }], ["s", { status: "SUSPENDED" }], ["d", { widget: { enabled: false } }]] as const) {
      const { garage } = await setup({ ...opts, key })
      expect((await book(garage.slug)).status, key).toBe(404)
    }
  })

  describe("rate limiting", () => {
    const hours = ["09:00", "10:00", "11:00", "12:00", "13:00"].map((t) => at(t).toISOString())

    it("limits one email to 3 bookings an hour", async () => {
      const { garage } = await setup()
      const email = `${PREFIX}busy@example.com`
      for (const start of hours.slice(0, 3)) expect((await book(garage.slug, { email, start })).status).toBe(201)
      const res = await book(garage.slug, { email, start: hours[3] })
      expect(res.status).toBe(429)
      expect(res.headers.get("retry-after")).toBe("3600")
      expect((await res.json()).code).toBe("rate_limited")
    })

    it("limits one IP to 3 bookings an hour, across different emails", async () => {
      const { garage } = await setup()
      const ip = { "x-forwarded-for": "203.0.113.50, 10.0.0.1" }
      for (const start of hours.slice(0, 3)) expect((await book(garage.slug, { start }, ip)).status).toBe(201)
      expect((await book(garage.slug, { start: hours[3] }, ip)).status).toBe(429)
      // A different IP is unaffected.
      expect((await book(garage.slug, { start: hours[3] }, { "x-forwarded-for": "203.0.113.51" })).status).toBe(201)

      const stored = await prisma.booking.findFirstOrThrow({ where: { garageId: garage.id } })
      expect(stored.ipHash).toHaveLength(32)
      expect(stored.ipHash).not.toContain("203")
    })

    it("doesn't throttle requests whose IP can't be determined", async () => {
      const { garage } = await setup()
      for (const start of hours.slice(0, 4)) expect((await book(garage.slug, { start })).status).toBe(201)
      expect((await prisma.booking.findFirstOrThrow({ where: { garageId: garage.id } })).ipHash).toBeNull()
    })

    it("caps a garage at 20 widget bookings an hour", async () => {
      const { garage } = await setup()
      await prisma.booking.createMany({
        data: Array.from({ length: 20 }, (_, i) => ({ garageId: garage.id, serviceType: "MOT", source: "WIDGET", status: "PENDING", scheduledAt: addDaysUtc(i + 10), totalPrice: 1, customerEmail: `${PREFIX}flood${i}@example.com` })),
      })
      expect((await book(garage.slug)).status).toBe(429)
    })

    it("only counts recent bookings (older than an hour don't count)", async () => {
      const { garage } = await setup()
      const email = `${PREFIX}old@example.com`
      await prisma.booking.createMany({
        data: Array.from({ length: 3 }, (_, i) => ({ garageId: garage.id, serviceType: "MOT", source: "WIDGET", status: "PENDING", scheduledAt: addDaysUtc(i + 10), totalPrice: 1, customerEmail: email, createdAt: new Date(Date.now() - 2 * 3600 * 1000) })),
      })
      expect((await book(garage.slug, { email })).status).toBe(201)
    })
  })
})

function addDaysUtc(n: number) {
  return new Date(Date.now() + n * 86400000)
}
