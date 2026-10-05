import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { createBooking, transitionBooking } from "@/lib/portal/booking-service"
import { createDepositCheckout, handleStripeEvent, refundOnCancel } from "@/lib/portal/payment-service"
import { cleanupPrefix, makeGarage } from "@/test/fixtures"

const stripe = {
  checkout: { sessions: { create: vi.fn() } },
  refunds: { create: vi.fn() },
}
vi.mock("@/lib/stripe", () => ({ getStripe: () => stripe, stripeConfigured: () => true }))

const PREFIX = "paysvc-"
const DAY = 86_400_000
const settings = (payments: object, widget: object = {}) => JSON.stringify({ payments: { enabled: true, depositPercent: 25, refundPolicy: "UNTIL_24H", ...payments }, widget })

beforeEach(async () => {
  vi.clearAllMocks()
  // Session ids are unique per booking (the column is unique), like real Stripe ids.
  let n = 0
  stripe.checkout.sessions.create.mockImplementation(async () => {
    const id = `cs_test_${PREFIX}${Date.now()}_${++n}`
    return { id, url: `https://checkout.stripe.test/${id}` }
  })
  stripe.refunds.create.mockResolvedValue({ id: "re_1" })
  await prisma.stripeEvent.deleteMany({ where: { id: { startsWith: "evt_paysvc" } } })
  await cleanupPrefix(PREFIX)
})
afterAll(async () => {
  await prisma.stripeEvent.deleteMany({ where: { id: { startsWith: "evt_paysvc" } } })
  await cleanupPrefix(PREFIX)
})

async function setup(opts: { payments?: object; widget?: object; price?: number; startInDays?: number; connected?: boolean } = {}) {
  const { garage } = await makeGarage(PREFIX, { portalSettings: settings(opts.payments ?? {}, opts.widget) })
  // Deposits are paid to the garage's own Stripe account, so a garage taking them has finished connecting one.
  if (opts.connected !== false) await prisma.garage.update({ where: { id: garage.id }, data: { stripeAccountId: `acct_${PREFIX}${garage.id}`, stripeChargesEnabled: true } })
  const booking = await createBooking({
    garageId: garage.id, source: "WIDGET", customerName: "Pat", customerEmail: `pat@${PREFIX}x.com`, vrm: "AB12CDE",
    serviceType: "MOT", scheduledAt: new Date(Date.now() + (opts.startInDays ?? 5) * DAY), totalPrice: opts.price ?? 200, notify: false,
  } as any)
  return { garage, booking }
}
const reload = (id: string) => prisma.booking.findUniqueOrThrow({ where: { id } })
const evt = (id: string, type: string, object: object) => ({ id: `evt_paysvc_${id}`, type, data: { object } }) as any
const paidSession = (bookingId: string) => ({ id: `cs_done_${bookingId}`, payment_status: "paid", payment_intent: "pi_1", metadata: { bookingId } })

describe("createDepositCheckout", () => {
  it("creates a checkout for the deposit in pence and marks the booking payment-pending", async () => {
    const { booking } = await setup({ payments: { depositPercent: 25 } })
    const result = await createDepositCheckout(booking.id)
    expect(result).toMatchObject({ url: expect.stringContaining("https://checkout.stripe.test/cs_test_"), depositPounds: 50 })
    const args = stripe.checkout.sessions.create.mock.calls[0][0]
    expect(args.line_items[0].price_data).toMatchObject({ currency: "gbp", unit_amount: 5000 })
    expect(args.metadata.bookingId).toBe(booking.id)
    // Destination charge to the garage's own account (no platform fee unless PLATFORM_FEE_PERCENT is set).
    expect(args.payment_intent_data.transfer_data.destination).toMatch(/^acct_/)
    expect(args.payment_intent_data.application_fee_amount).toBeUndefined()
    expect(args.success_url).toContain(booking.manageToken)
    expect(await reload(booking.id)).toMatchObject({ paymentStatus: "PENDING", depositAmount: 50, stripeSessionId: expect.stringContaining("cs_test_") })
  })

  it("does nothing when payments are off or the job is free", async () => {
    const off = await setup({ payments: { enabled: false } })
    expect(await createDepositCheckout(off.booking.id)).toBeNull()
    const free = await setup({ price: 0 })
    expect(await createDepositCheckout(free.booking.id)).toBeNull()
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
    expect((await reload(off.booking.id)).paymentStatus).toBe("NONE")
  })
})

describe("Stripe Connect", () => {
  afterEach(() => { delete process.env.PLATFORM_FEE_PERCENT })

  it("takes the platform fee as an application fee on the charge", async () => {
    process.env.PLATFORM_FEE_PERCENT = "10"
    const { booking } = await setup({ payments: { depositPercent: 25 } }) // £50 deposit
    await createDepositCheckout(booking.id)
    expect(stripe.checkout.sessions.create.mock.calls[0][0].payment_intent_data.application_fee_amount).toBe(500)
  })

  it("won't take a deposit for a garage that hasn't connected Stripe", async () => {
    const { booking } = await setup({ connected: false })
    expect(await createDepositCheckout(booking.id)).toBeNull()
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
    expect((await reload(booking.id)).paymentStatus).toBe("NONE")
  })

  it("won't take a deposit while the connected account can't take payments yet", async () => {
    const { booking, garage } = await setup()
    await prisma.garage.update({ where: { id: garage.id }, data: { stripeChargesEnabled: false } })
    expect(await createDepositCheckout(booking.id)).toBeNull()
  })

  it("updates a garage's payment state when Stripe sends account.updated", async () => {
    const { garage } = await setup({ connected: false })
    const acct = `acct_${PREFIX}upd${Date.now()}`
    await prisma.garage.update({ where: { id: garage.id }, data: { stripeAccountId: acct } })
    const fire = (id: string, flags: object) => handleStripeEvent({ id: `evt_paysvc_${id}`, type: "account.updated", data: { object: { id: acct, charges_enabled: true, payouts_enabled: true, details_submitted: true, ...flags } } } as any)

    await fire("acc1", { details_submitted: false })
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).stripeChargesEnabled).toBe(false)
    await fire("acc2", {})
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).stripeChargesEnabled).toBe(true)
    await fire("acc3", { payouts_enabled: false }) // Stripe later restricts the account
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).stripeChargesEnabled).toBe(false)
  })
})

describe("handleStripeEvent", () => {
  it("marks the booking paid once, even if Stripe redelivers the event", async () => {
    const { booking } = await setup()
    await createDepositCheckout(booking.id)
    const event = evt("a", "checkout.session.completed", paidSession(booking.id))

    expect(await handleStripeEvent(event)).toBe(true)
    expect(await handleStripeEvent(event)).toBe(false)
    expect(await reload(booking.id)).toMatchObject({ paymentStatus: "PAID", stripePaymentIntent: "pi_1" })
    expect(await prisma.bookingEvent.count({ where: { bookingId: booking.id, detail: { contains: "paid" } } })).toBe(1)
    expect(await prisma.notification.count({ where: { garageId: booking.garageId, title: "Deposit received" } })).toBe(1)
  })

  it("confirms the booking when the garage auto-confirms", async () => {
    const { booking } = await setup({ widget: { autoConfirm: true } })
    await createDepositCheckout(booking.id)
    await handleStripeEvent(evt("b", "checkout.session.completed", paidSession(booking.id)))
    expect((await reload(booking.id)).status).toBe("CONFIRMED")
  })

  it("releases an unpaid booking when checkout expires, but never one that was paid", async () => {
    const unpaid = await setup()
    await createDepositCheckout(unpaid.booking.id)
    await handleStripeEvent(evt("c", "checkout.session.expired", { metadata: { bookingId: unpaid.booking.id } }))
    expect(await reload(unpaid.booking.id)).toMatchObject({ status: "CANCELLED", paymentStatus: "FAILED", cancelReason: "Deposit not paid in time" })

    const paid = await setup()
    await createDepositCheckout(paid.booking.id)
    await handleStripeEvent(evt("d", "checkout.session.completed", paidSession(paid.booking.id)))
    await handleStripeEvent(evt("e", "checkout.session.expired", { metadata: { bookingId: paid.booking.id } }))
    expect(await reload(paid.booking.id)).toMatchObject({ status: "PENDING", paymentStatus: "PAID" })
  })

  it("ignores a completed event that isn't actually paid", async () => {
    const { booking } = await setup()
    await createDepositCheckout(booking.id)
    await handleStripeEvent(evt("f", "checkout.session.completed", { ...paidSession(booking.id), payment_status: "unpaid" }))
    expect((await reload(booking.id)).paymentStatus).toBe("PENDING")
  })
})

async function paidBooking(opts: Parameters<typeof setup>[0] = {}) {
  const s = await setup(opts)
  await createDepositCheckout(s.booking.id)
  await handleStripeEvent(evt(`p${Math.random()}`, "checkout.session.completed", paidSession(s.booking.id)))
  return s
}

describe("refundOnCancel", () => {
  it("refunds a customer who cancels 24h+ ahead, and records it", async () => {
    const { booking } = await paidBooking({ startInDays: 5 })
    await refundOnCancel(booking.id, "CUSTOMER")
    // The money was already paid to the garage, so the refund must be taken back from it.
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_1", amount: 5000, reverse_transfer: true, refund_application_fee: true },
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    )
    expect(await reload(booking.id)).toMatchObject({ paymentStatus: "REFUNDED", refundedAmount: 50 })
  })

  it("keeps the deposit when a customer cancels inside the window", async () => {
    const { booking } = await paidBooking({ startInDays: 0.5 })
    await refundOnCancel(booking.id, "CUSTOMER")
    expect(stripe.refunds.create).not.toHaveBeenCalled()
    expect((await reload(booking.id)).paymentStatus).toBe("PAID")
  })

  it("always refunds when the garage cancels, whatever the policy", async () => {
    const { booking } = await paidBooking({ payments: { refundPolicy: "NONE" }, startInDays: 0.2 })
    await refundOnCancel(booking.id, "GARAGE")
    expect(stripe.refunds.create).toHaveBeenCalledTimes(1)
  })

  it("never refunds twice for the same cancellation", async () => {
    const { booking } = await paidBooking()
    await refundOnCancel(booking.id, "GARAGE")
    await refundOnCancel(booking.id, "GARAGE")
    expect(stripe.refunds.create).toHaveBeenCalledTimes(1)
  })

  it("does not throw when Stripe fails, and flags it for manual follow-up", async () => {
    const { booking } = await paidBooking()
    stripe.refunds.create.mockRejectedValueOnce(new Error("stripe down"))
    await expect(refundOnCancel(booking.id, "GARAGE")).resolves.toBeUndefined()
    expect((await reload(booking.id)).paymentStatus).toBe("PAID")
    expect(await prisma.bookingEvent.count({ where: { bookingId: booking.id, detail: { contains: "Refund FAILED" } } })).toBe(1)
  })

  it("is triggered by cancelling through the booking service", async () => {
    const { booking, garage } = await paidBooking()
    await transitionBooking({ bookingId: booking.id, to: "CANCELLED", actor: { role: "GARAGE", garageId: garage.id } })
    expect(stripe.refunds.create).toHaveBeenCalledTimes(1)
    expect((await reload(booking.id)).status).toBe("CANCELLED")
  })
})
