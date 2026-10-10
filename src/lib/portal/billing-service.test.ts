import { afterAll, beforeEach, describe, expect, it } from "vitest"
import type Stripe from "stripe"
import { prisma } from "@/lib/prisma"
import { cleanupPrefix, makeGarage } from "@/test/fixtures"
import { applySubscription, fulfilCheckout, planForPriceId, refundLeadCredit, spendLeadCredit } from "./billing-service"
import { CREDIT_PACK } from "./plans"

const PREFIX = "billtest-"

beforeEach(async () => {
  await cleanupPrefix(PREFIX)
  process.env.STRIPE_PRICE_PRO = "price_pro_test"
  process.env.STRIPE_PRICE_PREMIUM = "price_premium_test"
})
afterAll(() => cleanupPrefix(PREFIX))

const session = (over: Partial<Stripe.Checkout.Session> & { metadata: Record<string, string> }) =>
  ({ id: `cs_${Math.random().toString(36).slice(2)}`, payment_status: "paid", ...over }) as Stripe.Checkout.Session

const subscription = (garageId: string, over: Partial<Stripe.Subscription> = {}) =>
  ({
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    metadata: { garageId },
    items: { data: [{ price: { id: "price_pro_test" }, current_period_end: 1_800_000_000 }] },
    ...over,
  }) as unknown as Stripe.Subscription

describe("planForPriceId", () => {
  it("maps a Stripe price to its plan", () => {
    expect(planForPriceId("price_pro_test")).toBe("PRO")
    expect(planForPriceId("price_premium_test")).toBe("PREMIUM")
    expect(planForPriceId("price_unknown")).toBeNull()
    expect(planForPriceId(undefined)).toBeNull()
  })
})

describe("applySubscription", () => {
  it("puts the garage on the plan its price belongs to, with the renewal date", async () => {
    const { garage } = await makeGarage(PREFIX)
    await applySubscription(subscription(garage.id))
    const g = await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })
    expect(g).toMatchObject({ plan: "PRO", subscriptionStatus: "active", stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1" })
    expect(g.subscriptionPeriodEnd?.getTime()).toBe(1_800_000_000 * 1000)
  })

  it("keeps the plan through a failed payment (past_due) but drops to FREE when cancelled", async () => {
    const { garage } = await makeGarage(PREFIX)
    await applySubscription(subscription(garage.id))
    await applySubscription(subscription(garage.id, { status: "past_due" }))
    expect(await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).toMatchObject({ plan: "PRO", subscriptionStatus: "past_due" })

    await applySubscription(subscription(garage.id, { status: "canceled" }))
    expect(await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).toMatchObject({ plan: "FREE", subscriptionStatus: null, stripeSubscriptionId: null, subscriptionPeriodEnd: null })
  })

  it("ignores a subscription that belongs to no garage", async () => {
    await expect(applySubscription(subscription("no-such-garage", { customer: "cus_nobody" }))).resolves.toBeUndefined()
  })
})

describe("fulfilCheckout", () => {
  it("adds a credit pack once, however many times the same session is delivered", async () => {
    const { garage } = await makeGarage(PREFIX)
    const s = session({ metadata: { kind: "credits", garageId: garage.id } })
    await fulfilCheckout(s)
    await fulfilCheckout(s)
    const g = await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })
    expect(g.leadCredits).toBe(CREDIT_PACK.credits)
    expect(await prisma.leadCreditTransaction.count({ where: { garageId: garage.id, reason: "PURCHASE" } })).toBe(1)
  })

  it("starts a featured placement, and a second purchase extends it", async () => {
    const { garage } = await makeGarage(PREFIX)
    const now = new Date("2026-10-10T12:00:00Z")
    await fulfilCheckout(session({ metadata: { kind: "featured", garageId: garage.id } }), now)
    const first = (await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).featuredUntil!
    expect(first.toISOString()).toBe("2026-11-09T12:00:00.000Z")

    await fulfilCheckout(session({ metadata: { kind: "featured", garageId: garage.id } }), now)
    const second = (await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).featuredUntil!
    expect(second.toISOString()).toBe("2026-12-09T12:00:00.000Z")
  })

  it("does nothing for an unpaid session or one with no garage", async () => {
    const { garage } = await makeGarage(PREFIX)
    await fulfilCheckout(session({ payment_status: "unpaid", metadata: { kind: "credits", garageId: garage.id } }))
    await fulfilCheckout(session({ metadata: { kind: "credits" } }))
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).leadCredits).toBe(0)
  })
})

describe("lead credits", () => {
  it("spends one credit at a time and never goes below zero", async () => {
    const { garage } = await makeGarage(PREFIX)
    await prisma.garage.update({ where: { id: garage.id }, data: { leadCredits: 1 } })
    // Two answers racing for the last credit: exactly one wins.
    const results = await Promise.all([spendLeadCredit(garage.id, "job-a"), spendLeadCredit(garage.id, "job-b")])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).leadCredits).toBe(0)
  })

  it("gives a credit back when the answer failed to save", async () => {
    const { garage } = await makeGarage(PREFIX)
    await prisma.garage.update({ where: { id: garage.id }, data: { leadCredits: 2 } })
    await spendLeadCredit(garage.id, "job-a")
    await refundLeadCredit(garage.id, "job-a")
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).leadCredits).toBe(2)
    const log = await prisma.leadCreditTransaction.findMany({ where: { garageId: garage.id }, orderBy: { createdAt: "asc" } })
    expect(log.map((t) => t.reason).sort()).toEqual(["LEAD", "REFUND"])
  })
})
