import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { POST as postBooking } from "./bookings/route"
import { GET as getManage } from "../../booking/[token]/route"
import { handleStripeEvent } from "@/lib/portal/payment-service"
import { DEFAULT_PORTAL_SETTINGS, serializePortalSettings } from "@/lib/portal/portal-settings"
import { addDays, londonWallToUtc, todayLondon } from "@/lib/portal/tz"
import { cleanupPrefix, makeGarage } from "@/test/fixtures"

const stripe = vi.hoisted(() => ({ checkout: { sessions: { create: vi.fn() } }, refunds: { create: vi.fn() } }))
vi.mock("@/lib/stripe", () => ({ getStripe: () => stripe, stripeConfigured: () => true }))
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn(async () => ({ success: true })) }))

const PREFIX = "widgetpay-"
const ALL_OPEN = Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, { open: true, from: "09:00", to: "17:00" }]))
const DATE = addDays(todayLondon(), 4)
let n = 0

async function setup(payments: object) {
  const settings = serializePortalSettings({
    ...DEFAULT_PORTAL_SETTINGS,
    widget: { ...DEFAULT_PORTAL_SETTINGS.widget, slotMins: 60, leadHours: 0 },
    payments: { ...DEFAULT_PORTAL_SETTINGS.payments, ...payments },
  } as any)
  const { garage } = await makeGarage(PREFIX, { key: `g${n++}`, openingHours: ALL_OPEN, portalSettings: settings, services: ["MOT"] })
  await prisma.servicePrice.create({ data: { garageId: garage.id, serviceType: "MOT", priceFrom: 80, durationMins: 60 } })
  return garage
}

const book = (slug: string) =>
  postBooking(
    new Request("http://x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: "MOT", start: londonWallToUtc(DATE, "10:00").toISOString(), name: "Pay Pal", email: `${PREFIX}c${n++}@example.com`, phone: "07700900123", vrm: "wd19 abc" }),
    }),
    { params: Promise.resolve({ slug }) }
  )

beforeEach(async () => {
  vi.clearAllMocks()
  stripe.checkout.sessions.create.mockImplementation(async () => ({ id: `cs_${PREFIX}${Date.now()}_${n++}`, url: "https://checkout.stripe.test/pay" }))
  await prisma.stripeEvent.deleteMany({ where: { id: { startsWith: "evt_widgetpay" } } })
  await cleanupPrefix(PREFIX)
})
afterAll(async () => {
  await prisma.stripeEvent.deleteMany({ where: { id: { startsWith: "evt_widgetpay" } } })
  await cleanupPrefix(PREFIX)
})

describe("widget booking with online deposits", () => {
  it("returns a checkout URL and records the pending deposit when the garage takes payments", async () => {
    const g = await setup({ enabled: true, depositPercent: 25 })
    const res = await book(g.slug)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.checkoutUrl).toBe("https://checkout.stripe.test/pay")
    const b = await prisma.booking.findFirstOrThrow({ where: { reference: body.reference } })
    expect(b).toMatchObject({ paymentStatus: "PENDING", depositAmount: 20 })
  })

  it("books normally without a checkout when payments are off", async () => {
    const g = await setup({ enabled: false })
    const body = await (await book(g.slug)).json()
    expect(body.checkoutUrl).toBeNull()
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it("still keeps the booking if Stripe is down", async () => {
    const g = await setup({ enabled: true })
    stripe.checkout.sessions.create.mockRejectedValueOnce(new Error("stripe down"))
    const res = await book(g.slug)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.checkoutUrl).toBeNull()
    expect(await prisma.booking.count({ where: { reference: body.reference } })).toBe(1)
  })

  it("tells the customer what cancelling would do to a paid deposit", async () => {
    const g = await setup({ enabled: true, refundPolicy: "UNTIL_24H" })
    const body = await (await book(g.slug)).json()
    const b = await prisma.booking.findFirstOrThrow({ where: { reference: body.reference } })
    await handleStripeEvent({ id: "evt_widgetpay_1", type: "checkout.session.completed", data: { object: { id: b.stripeSessionId, payment_status: "paid", payment_intent: "pi_w", metadata: { bookingId: b.id } } } } as any)

    const manage = await (await getManage(new Request("http://x"), { params: Promise.resolve({ token: b.manageToken! }) })).json()
    expect(manage.booking.paymentStatus).toBe("PAID")
    expect(manage.booking.cancelRefundNote).toMatch(/refunded/i) // booked 4 days ahead: inside the 24h rule
  })
})
