import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import type Stripe from "stripe"
import { prisma } from "@/lib/prisma"
import { cleanupPrefix, makeGarage, makeLocation } from "@/test/fixtures"
import { organisationIdOf, syncOrganisationBilling } from "@/lib/org/billing"
import { applySubscription, fulfilCheckout, refundLeadCredit, spendLeadCredit } from "@/lib/portal/billing-service"
import { applyAccountState } from "@/lib/portal/stripe-connect"
import { ensureInvoiceNumber } from "@/lib/portal/invoice"
import { CREDIT_PACK } from "@/lib/portal/plans"
import { makeWalkInBooking } from "@/test/fixtures"

// While the Garage columns are the source of truth, every billing write must keep the business's copy in step, so the
// later switch of authority needs no resync and a rollback to older code loses nothing.

const PREFIX = "orgbill-"
beforeEach(async () => {
  await cleanupPrefix(PREFIX)
  process.env.STRIPE_PRICE_PRO = "price_pro_orgbill"
})
afterAll(() => cleanupPrefix(PREFIX))

const org = async (garageId: string) => (await prisma.garage.findUniqueOrThrow({ where: { id: garageId }, include: { organisation: true } })).organisation!

const subscription = (garageId: string, over: Partial<Stripe.Subscription> = {}) =>
  ({ id: "sub_ob", customer: `cus_${garageId}`, status: "active", metadata: { garageId }, items: { data: [{ price: { id: "price_pro_orgbill" }, current_period_end: 1_800_000_000 }] }, ...over }) as unknown as Stripe.Subscription

describe("syncOrganisationBilling", () => {
  it("copies the garage's billing onto its business", async () => {
    const { garage } = await makeGarage(PREFIX)
    await prisma.garage.update({ where: { id: garage.id }, data: { plan: "PRO", subscriptionStatus: "active", leadCredits: 4, invoiceCounter: 9, stripeCustomerId: `${PREFIX}cus`, stripeAccountId: `${PREFIX}acct`, stripeChargesEnabled: true } })
    expect(await syncOrganisationBilling(garage.id)).toBe(true)
    expect(await org(garage.id)).toMatchObject({ plan: "PRO", subscriptionStatus: "active", leadCredits: 4, invoiceCounter: 9, stripeCustomerId: `${PREFIX}cus`, stripeAccountId: `${PREFIX}acct`, stripeChargesEnabled: true })
  })

  it("does nothing for a garage with no business (legacy)", async () => {
    const { garage } = await makeGarage(PREFIX, { legacy: true })
    expect(await syncOrganisationBilling(garage.id)).toBe(false)
  })

  it("does nothing once a business has several locations: one location's figures must never overwrite a shared balance", async () => {
    const { garage, organisation } = await makeGarage(PREFIX)
    await makeLocation(PREFIX, organisation!.id)
    await prisma.garage.update({ where: { id: garage.id }, data: { plan: "PREMIUM", leadCredits: 50 } })
    expect(await syncOrganisationBilling(garage.id)).toBe(false)
    expect(await prisma.organisation.findUniqueOrThrow({ where: { id: organisation!.id } })).toMatchObject({ plan: "FREE", leadCredits: 0 })
  })

  it("never throws, even when the mirror write fails (a billing flow must not break because of it)", async () => {
    const { garage, organisation } = await makeGarage(PREFIX)
    // Another business already owns this Stripe customer id, so the unique constraint rejects the copy.
    const other = await makeGarage(PREFIX, { key: "other" })
    await prisma.organisation.update({ where: { id: other.organisation!.id }, data: { stripeCustomerId: `${PREFIX}dup` } })
    await prisma.garage.update({ where: { id: garage.id }, data: { stripeCustomerId: `${PREFIX}dup` } })
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(syncOrganisationBilling(garage.id)).resolves.toBe(false)
    spy.mockRestore()
    expect((await prisma.organisation.findUniqueOrThrow({ where: { id: organisation!.id } })).stripeCustomerId).toBeNull()
  })

  it("organisationIdOf finds the business, or null", async () => {
    const a = await makeGarage(PREFIX, { key: "a" })
    const b = await makeGarage(PREFIX, { key: "b", legacy: true })
    expect(await organisationIdOf(a.garage.id)).toBe(a.organisation!.id)
    expect(await organisationIdOf(b.garage.id)).toBeNull()
    expect(await organisationIdOf("nope")).toBeNull()
  })
})

describe("the billing flows keep the business in step", () => {
  it("a subscription (and its cancellation)", async () => {
    const { garage } = await makeGarage(PREFIX)
    await applySubscription(subscription(garage.id))
    expect(await org(garage.id)).toMatchObject({ plan: "PRO", subscriptionStatus: "active", stripeSubscriptionId: "sub_ob", stripeCustomerId: `cus_${garage.id}` })
    await applySubscription(subscription(garage.id, { status: "canceled" }))
    expect(await org(garage.id)).toMatchObject({ plan: "FREE", subscriptionStatus: null, stripeSubscriptionId: null })
  })

  it("a credit purchase, and the credit row records which business it belongs to", async () => {
    const { garage, organisation } = await makeGarage(PREFIX)
    await fulfilCheckout({ id: `cs_${PREFIX}1`, payment_status: "paid", metadata: { kind: "credits", garageId: garage.id } } as unknown as Stripe.Checkout.Session)
    expect((await org(garage.id)).leadCredits).toBe(CREDIT_PACK.credits)
    expect((await prisma.leadCreditTransaction.findFirstOrThrow({ where: { garageId: garage.id } })).organisationId).toBe(organisation!.id)
  })

  it("spending and refunding a lead credit", async () => {
    const { garage, organisation } = await makeGarage(PREFIX)
    await prisma.garage.update({ where: { id: garage.id }, data: { leadCredits: 3 } })
    await spendLeadCredit(garage.id, "job-1")
    expect((await org(garage.id)).leadCredits).toBe(2)
    await refundLeadCredit(garage.id, "job-1")
    expect((await org(garage.id)).leadCredits).toBe(3)
    const rows = await prisma.leadCreditTransaction.findMany({ where: { garageId: garage.id } })
    expect(rows.map((r) => r.organisationId)).toEqual([organisation!.id, organisation!.id])
  })

  it("Stripe Connect account state", async () => {
    const { garage } = await makeGarage(PREFIX)
    await prisma.garage.update({ where: { id: garage.id }, data: { stripeAccountId: `acct_${PREFIX}x` } })
    await syncOrganisationBilling(garage.id)
    await applyAccountState({ id: `acct_${PREFIX}x`, charges_enabled: true, payouts_enabled: true, details_submitted: true })
    expect(await org(garage.id)).toMatchObject({ stripeAccountId: `acct_${PREFIX}x`, stripeChargesEnabled: true })
    await applyAccountState({ id: `acct_${PREFIX}x`, charges_enabled: false, payouts_enabled: true, details_submitted: true })
    expect((await org(garage.id)).stripeChargesEnabled).toBe(false)
  })

  it("the invoice counter", async () => {
    const { garage } = await makeGarage(PREFIX)
    const booking = await makeWalkInBooking(garage.id, { status: "COMPLETED", completedAt: new Date() })
    const { number } = await ensureInvoiceNumber(booking.id, garage.id)
    expect(number).toBe("INV-0001")
    expect((await org(garage.id)).invoiceCounter).toBe(1)
  })
})
