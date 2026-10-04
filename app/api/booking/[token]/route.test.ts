import { describe, it, expect, afterAll, beforeEach } from "vitest"
import { prisma } from "@/lib/prisma"
import { GET, POST } from "./route"
import { GET as getSlots } from "./slots/route"
import { londonDateString } from "@/lib/portal/tz"
import { createBooking } from "@/lib/portal/booking-service"
import { cleanupPrefix, makeGarage } from "@/test/fixtures"

const PREFIX = "managelink-"
const ctx = (token: string) => ({ params: Promise.resolve({ token }) })
const post = (token: string, body: unknown) =>
  POST(new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), ctx(token))

beforeEach(() => cleanupPrefix(PREFIX))
afterAll(() => cleanupPrefix(PREFIX))

async function widgetBooking(garageId: string) {
  return createBooking({
    garageId, source: "WIDGET", customerName: "Guest", customerEmail: `g@${PREFIX}x.com`, vrm: "AB12CDE",
    serviceType: "MOT", scheduledAt: new Date(Date.now() + 3 * 86_400_000), totalPrice: 50, notify: false,
  } as any)
}

describe("/api/booking/[token]", () => {
  it("shows a customer-safe view and hides garage-internal fields", async () => {
    const { garage } = await makeGarage(PREFIX)
    const b = await widgetBooking(garage.id)
    expect(b.manageToken).toMatch(/^[a-f0-9]{32}$/)
    await prisma.booking.update({ where: { id: b.id }, data: { notes: "internal only" } })

    const res = await GET(new Request("http://x"), ctx(b.manageToken!))
    expect(res.status).toBe(200)
    const text = JSON.stringify(await res.json())
    expect(text).toContain(b.reference!)
    expect(text).not.toContain("internal only")
    expect(text).not.toContain(b.manageToken!)
  })

  it("404s for unknown or malformed tokens", async () => {
    expect((await GET(new Request("http://x"), ctx("nope"))).status).toBe(404)
    expect((await GET(new Request("http://x"), ctx("a".repeat(32)))).status).toBe(404)
  })

  it("lets the customer cancel once, recording who did it", async () => {
    const { garage } = await makeGarage(PREFIX)
    const b = await widgetBooking(garage.id)
    const res = await post(b.manageToken!, { action: "cancel", reason: "Plans changed" })
    expect(res.status).toBe(200)
    expect((await res.json()).booking.status).toBe("CANCELLED")
    const events = await prisma.bookingEvent.findMany({ where: { bookingId: b.id, type: "STATUS" } })
    expect(events[0]).toMatchObject({ actorType: "CUSTOMER" })
    expect(events[0].detail).toContain("Plans changed")
    expect((await post(b.manageToken!, { action: "cancel" })).status).toBe(409)
  })

  it("only allows reviews on completed bookings, once, and updates the garage rating", async () => {
    const { garage } = await makeGarage(PREFIX)
    const b = await widgetBooking(garage.id)
    const review = { action: "review", rating: 5, comment: "Great service, would use again" }
    expect((await post(b.manageToken!, review)).status).toBe(409)

    await prisma.booking.update({ where: { id: b.id }, data: { status: "COMPLETED", completedAt: new Date() } })
    expect((await post(b.manageToken!, { ...review, comment: "short" })).status).toBe(400)
    const ok = await post(b.manageToken!, review)
    expect(ok.status).toBe(200)
    expect((await ok.json()).booking.review.rating).toBe(5)
    expect((await post(b.manageToken!, review)).status).toBe(409)

    const g = await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })
    expect(g.totalReviews).toBe(1)
    const saved = await prisma.review.findUniqueOrThrow({ where: { bookingId: b.id } })
    expect(saved).toMatchObject({ ownerId: null, customerName: "Guest" })
  })

  describe("rescheduling", () => {
    const week = Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, { open: true, from: "09:00", to: "17:00" }]))
    const slotsFor = (token: string, date: string) => getSlots(new Request(`http://x?date=${date}`), ctx(token))

    async function setup() {
      const { garage } = await makeGarage(PREFIX, { openingHours: week, portalSettings: JSON.stringify({ widget: { enabled: true, leadHours: 0, maxDaysAhead: 60 } }) })
      const b = await widgetBooking(garage.id)
      return { garage, b }
    }
    const day = (offset: number) => londonDateString(new Date(Date.now() + offset * 86_400_000))

    it("offers slots (including its own) and moves the booking to one of them", async () => {
      const { b } = await setup()
      const date = day(5)
      const { slots } = await (await slotsFor(b.manageToken!, date)).json()
      expect(slots.length).toBeGreaterThan(0)

      const target = slots[slots.length - 1].start
      const res = await post(b.manageToken!, { action: "reschedule", start: target })
      expect(res.status).toBe(200)
      const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })
      expect(after.scheduledAt.toISOString()).toBe(target)
      expect(await prisma.bookingEvent.count({ where: { bookingId: b.id, type: "RESCHEDULED", actorType: "CUSTOMER" } })).toBe(1)
      expect(await prisma.notification.count({ where: { garageId: b.garageId, title: "Customer moved a booking" } })).toBe(1)
    })

    it("rejects times the garage doesn't offer", async () => {
      const { b } = await setup()
      const odd = new Date(Date.now() + 5 * 86_400_000)
      odd.setUTCHours(3, 7, 0, 0) // 03:07 is outside opening hours
      const res = await post(b.manageToken!, { action: "reschedule", start: odd.toISOString() })
      expect(res.status).toBe(409)
      expect((await res.json()).code).toBe("slot_taken")
    })

    it("is not available when the garage has no online booking, or the booking is cancelled", async () => {
      const { garage } = await makeGarage(PREFIX, { key: "nowidget", portalSettings: JSON.stringify({ widget: { enabled: false } }) })
      const b = await widgetBooking(garage.id)
      expect((await (await GET(new Request("http://x"), ctx(b.manageToken!))).json()).booking.canReschedule).toBe(false)
      expect((await slotsFor(b.manageToken!, day(5))).status).toBe(409)

      const { b: b2 } = await setup()
      await post(b2.manageToken!, { action: "cancel" })
      expect((await post(b2.manageToken!, { action: "reschedule", start: new Date(Date.now() + 5 * 86_400_000).toISOString() })).status).toBe(409)
    })
  })
})
