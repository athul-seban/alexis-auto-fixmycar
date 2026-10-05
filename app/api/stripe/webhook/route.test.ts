import Stripe from "stripe"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { createBooking } from "@/lib/portal/booking-service"
import { cleanupPrefix, makeGarage } from "@/test/fixtures"

const SECRET = "whsec_test_secret"
const PREFIX = "stripehook-"
const EVENT = "evt_stripehook_1"

// Imported after the env is set, because the Stripe client is created from it on first use.
let POST: (req: Request) => Promise<Response>
beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy"
  process.env.STRIPE_WEBHOOK_SECRET = SECRET
  POST = (await import("./route")).POST
})

const clean = async () => {
  await prisma.stripeEvent.deleteMany({ where: { id: EVENT } })
  await cleanupPrefix(PREFIX)
}
beforeEach(clean)
afterAll(clean)

async function pendingBooking() {
  const { garage } = await makeGarage(PREFIX)
  const b = await createBooking({
    garageId: garage.id, source: "WIDGET", customerName: "Pat", customerEmail: `pat@${PREFIX}x.com`, vrm: "AB12CDE",
    serviceType: "MOT", scheduledAt: new Date(Date.now() + 5 * 86_400_000), totalPrice: 100, notify: false,
  } as any)
  await prisma.booking.update({ where: { id: b.id }, data: { paymentStatus: "PENDING", depositAmount: 25, stripeSessionId: `cs_${PREFIX}1` } })
  return b
}

const payload = (bookingId: string) =>
  JSON.stringify({ id: EVENT, object: "event", type: "checkout.session.completed", data: { object: { id: `cs_${PREFIX}1`, object: "checkout.session", payment_status: "paid", payment_intent: "pi_hook", metadata: { bookingId } } } })
const signed = (body: string, secret = SECRET) =>
  new Request("http://x/api/stripe/webhook", { method: "POST", body, headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload: body, secret }) } })

describe("POST /api/stripe/webhook", () => {
  it("rejects a missing or wrong signature and changes nothing", async () => {
    const b = await pendingBooking()
    const body = payload(b.id)
    expect((await POST(new Request("http://x", { method: "POST", body }))).status).toBe(400)
    expect((await POST(signed(body, "whsec_someone_else"))).status).toBe(400)
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).paymentStatus).toBe("PENDING")
  })

  it("marks the booking paid for a correctly signed event, and treats a replay as a duplicate", async () => {
    const b = await pendingBooking()
    const body = payload(b.id)

    const first = await POST(signed(body))
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ received: true, duplicate: false })
    expect(await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ paymentStatus: "PAID", stripePaymentIntent: "pi_hook" })

    const replay = await POST(signed(body))
    expect((await replay.json()).duplicate).toBe(true)
    expect(await prisma.notification.count({ where: { garageId: b.garageId, title: "Deposit received" } })).toBe(1)
  })

  it("accepts a connected-account event signed with the Connect endpoint's own secret", async () => {
    const CONNECT_SECRET = "whsec_connect_secret"
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = CONNECT_SECRET
    try {
      const { garage } = await makeGarage(PREFIX, { key: "conn" })
      await prisma.garage.update({ where: { id: garage.id }, data: { stripeAccountId: "acct_hook_conn" } })
      const body = JSON.stringify({ id: "evt_stripehook_conn", object: "event", type: "account.updated", data: { object: { id: "acct_hook_conn", object: "account", charges_enabled: true, payouts_enabled: true, details_submitted: true } } })
      const res = await POST(signed(body, CONNECT_SECRET))
      expect(res.status).toBe(200)
      expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).stripeChargesEnabled).toBe(true)
      // A secret that matches neither endpoint is still rejected.
      expect((await POST(signed(body, "whsec_neither"))).status).toBe(400)
    } finally {
      delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET
      await prisma.stripeEvent.deleteMany({ where: { id: "evt_stripehook_conn" } })
    }
  })

  it("rejects a payload altered after signing", async () => {
    const b = await pendingBooking()
    const body = payload(b.id)
    const tampered = new Request("http://x", { method: "POST", body: body.replace("pi_hook", "pi_evil"), headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET }) } })
    expect((await POST(tampered)).status).toBe(400)
  })
})
