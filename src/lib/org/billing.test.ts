import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import type Stripe from "stripe"
import { prisma } from "@/lib/prisma"
import { cleanupPrefix, makeGarage, makeLocation, makeWalkInBooking } from "@/test/fixtures"
import {
  addCredits,
  billingOwnerOf,
  claimStripeId,
  creditHistoryWhere,
  getBilling,
  locationIdsOf,
  mirrorBillingToLocations,
  organisationIdOf,
  syncOrganisationBilling,
  takeCredit,
  updateBilling,
} from "@/lib/org/billing"
import { applySubscription, fulfilCheckout, refundLeadCredit, spendLeadCredit } from "@/lib/portal/billing-service"
import { applyAccountState } from "@/lib/portal/stripe-connect"
import { ensureInvoiceNumber } from "@/lib/portal/invoice"
import { CREDIT_PACK } from "@/lib/portal/plans"

// Billing belongs to the BUSINESS. The Organisation row is the truth; the locations' Garage columns are display copies
// that every write keeps in step (so older code and a rollback still see the right plan and balance).

const PREFIX = "orgbill-"
beforeEach(async () => {
  await cleanupPrefix(PREFIX)
  process.env.STRIPE_PRICE_PRO = "price_pro_orgbill"
})
afterAll(() => cleanupPrefix(PREFIX))

const org = (organisationId: string) => prisma.organisation.findUniqueOrThrow({ where: { id: organisationId } })
const loc = (garageId: string) => prisma.garage.findUniqueOrThrow({ where: { id: garageId } })

const subscription = (garageId: string, over: Partial<Stripe.Subscription> = {}) =>
  ({ id: "sub_ob", customer: `cus_${garageId}`, status: "active", metadata: { garageId }, items: { data: [{ price: { id: "price_pro_orgbill" }, current_period_end: 1_800_000_000 }] }, ...over }) as unknown as Stripe.Subscription

/** A business with two locations, the first being the original (oldest). */
async function twoLocations() {
  const first = await makeGarage(PREFIX)
  const second = await makeLocation(PREFIX, first.organisation!.id)
  return { garage: first.garage, second, organisation: first.organisation! }
}

describe("who owns the billing", () => {
  it("is the business for a garage that has one, and the garage itself for a legacy garage", async () => {
    const a = await makeGarage(PREFIX, { key: "a" })
    const b = await makeGarage(PREFIX, { key: "b", legacy: true })
    expect(await billingOwnerOf(a.garage.id)).toEqual({ organisationId: a.organisation!.id })
    expect(await billingOwnerOf(b.garage.id)).toEqual({ garageId: b.garage.id })
    expect(await organisationIdOf(a.garage.id)).toBe(a.organisation!.id)
    expect(await organisationIdOf(b.garage.id)).toBeNull()
    expect(await organisationIdOf("nope")).toBeNull()
  })

  it("getBilling reads the business, not a stale copy on the location", async () => {
    const { garage, organisation } = await makeGarage(PREFIX)
    await prisma.organisation.update({ where: { id: organisation!.id }, data: { plan: "PREMIUM", leadCredits: 12 } })
    // The location's own column still says FREE/0: the decision-making read must ignore it.
    expect(await loc(garage.id)).toMatchObject({ plan: "FREE", leadCredits: 0 })
    expect(await getBilling(garage.id)).toMatchObject({ plan: "PREMIUM", leadCredits: 12, organisationId: organisation!.id })
  })

  it("a legacy garage still reads and writes its own columns", async () => {
    const { garage } = await makeGarage(PREFIX, { legacy: true })
    await updateBilling(garage.id, { plan: "PRO", leadCredits: 3 })
    expect(await getBilling(garage.id)).toMatchObject({ plan: "PRO", leadCredits: 3, organisationId: null })
    expect(await loc(garage.id)).toMatchObject({ plan: "PRO", leadCredits: 3 })
    expect(await takeCredit({ garageId: garage.id })).toBe(true)
    expect((await getBilling(garage.id)).leadCredits).toBe(2)
  })

  it("lists every location of the business (pooled counts), or just the garage when it has none", async () => {
    const { garage, second } = await twoLocations()
    expect((await locationIdsOf(garage.id)).sort()).toEqual([garage.id, second.id].sort())
    expect(await locationIdsOf(second.id)).toHaveLength(2)
    const legacy = await makeGarage(PREFIX, { key: "legacy", legacy: true })
    expect(await locationIdsOf(legacy.garage.id)).toEqual([legacy.garage.id])
  })
})

describe("writing billing", () => {
  it("writes the business first and copies it onto every location", async () => {
    const { garage, second, organisation } = await twoLocations()
    await updateBilling(second.id, { plan: "PRO", subscriptionStatus: "active", leadCredits: 4 })
    expect(await org(organisation.id)).toMatchObject({ plan: "PRO", subscriptionStatus: "active", leadCredits: 4 })
    for (const id of [garage.id, second.id]) expect(await loc(id)).toMatchObject({ plan: "PRO", subscriptionStatus: "active", leadCredits: 4 })
  })

  it("puts the unique Stripe ids on the oldest location only (the columns are unique per garage)", async () => {
    const { garage, second, organisation } = await twoLocations()
    await updateBilling(second.id, { stripeCustomerId: `${PREFIX}cus`, stripeSubscriptionId: `${PREFIX}sub`, stripeAccountId: `${PREFIX}acct` })
    expect(await org(organisation.id)).toMatchObject({ stripeCustomerId: `${PREFIX}cus`, stripeSubscriptionId: `${PREFIX}sub`, stripeAccountId: `${PREFIX}acct` })
    expect(await loc(garage.id)).toMatchObject({ stripeCustomerId: `${PREFIX}cus`, stripeSubscriptionId: `${PREFIX}sub`, stripeAccountId: `${PREFIX}acct` })
    expect(await loc(second.id)).toMatchObject({ stripeCustomerId: null, stripeSubscriptionId: null, stripeAccountId: null })
  })

  it("never throws when the copy fails: the business already holds the truth", async () => {
    const { garage, organisation } = await twoLocations()
    // Another garage's column already carries this customer id, so the copy onto the oldest location is rejected.
    const other = await makeGarage(PREFIX, { key: "other", legacy: true })
    await prisma.garage.update({ where: { id: other.garage.id }, data: { stripeCustomerId: `${PREFIX}dup` } })
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(updateBilling(garage.id, { stripeCustomerId: `${PREFIX}dup`, plan: "PRO" })).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
    expect(await org(organisation.id)).toMatchObject({ stripeCustomerId: `${PREFIX}dup`, plan: "PRO" })
    // Repairable: once the clash is gone the same mirror succeeds.
    await prisma.garage.update({ where: { id: other.garage.id }, data: { stripeCustomerId: null } })
    await mirrorBillingToLocations(organisation.id)
    expect((await loc(garage.id)).stripeCustomerId).toBe(`${PREFIX}dup`)
  })
})

describe("lead credits are one pool for the business", () => {
  it("any location spends from it, and it never goes below zero when locations race for the last credit", async () => {
    const { garage, second, organisation } = await twoLocations()
    await addCredits({ organisationId: organisation.id }, 1)
    const results = await Promise.all([spendLeadCredit(garage.id, "job-a"), spendLeadCredit(second.id, "job-b")])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect((await org(organisation.id)).leadCredits).toBe(0)
    expect(await takeCredit({ organisationId: organisation.id })).toBe(false)
  })

  it("a credit purchase from one location is available to the other, and the history shows both locations' rows", async () => {
    const { garage, second, organisation } = await twoLocations()
    await fulfilCheckout({ id: `cs_${PREFIX}1`, payment_status: "paid", metadata: { kind: "credits", garageId: second.id } } as unknown as Stripe.Checkout.Session)
    expect((await getBilling(garage.id)).leadCredits).toBe(CREDIT_PACK.credits)
    expect(await spendLeadCredit(garage.id, "job-1")).toBe(true)

    const rows = await prisma.leadCreditTransaction.findMany({ where: await creditHistoryWhere(garage.id) })
    expect(rows.map((r) => r.reason).sort()).toEqual(["LEAD", "PURCHASE"])
    expect(rows.every((r) => r.organisationId === organisation.id)).toBe(true)
    // Both locations see the same history.
    expect(await prisma.leadCreditTransaction.count({ where: await creditHistoryWhere(second.id) })).toBe(2)
  })

  it("spending and refunding a lead credit", async () => {
    const { garage, organisation } = await makeGarage(PREFIX)
    await updateBilling(garage.id, { leadCredits: 3 })
    await spendLeadCredit(garage.id, "job-1")
    expect((await org(organisation!.id)).leadCredits).toBe(2)
    await refundLeadCredit(garage.id, "job-1")
    expect((await org(organisation!.id)).leadCredits).toBe(3)
    const rows = await prisma.leadCreditTransaction.findMany({ where: { garageId: garage.id } })
    expect(rows.map((r) => r.organisationId)).toEqual([organisation!.id, organisation!.id])
  })
})

describe("Stripe ids", () => {
  it("claimStripeId sets an id once; a second claim doesn't replace it", async () => {
    const { organisation } = await makeGarage(PREFIX)
    const owner = { organisationId: organisation!.id }
    expect(await claimStripeId(owner, "stripeAccountId", `acct_${PREFIX}1`)).toBe(true)
    expect(await claimStripeId(owner, "stripeAccountId", `acct_${PREFIX}2`)).toBe(false)
    expect((await org(organisation!.id)).stripeAccountId).toBe(`acct_${PREFIX}1`)
  })

  it("a subscription (and its cancellation) is the business's, whichever location it names", async () => {
    const { garage, second, organisation } = await twoLocations()
    await applySubscription(subscription(second.id))
    expect(await org(organisation.id)).toMatchObject({ plan: "PRO", subscriptionStatus: "active", stripeSubscriptionId: "sub_ob", stripeCustomerId: `cus_${second.id}` })
    expect(await loc(garage.id)).toMatchObject({ plan: "PRO", stripeSubscriptionId: "sub_ob" })
    await applySubscription(subscription(second.id, { status: "canceled" }))
    expect(await org(organisation.id)).toMatchObject({ plan: "FREE", subscriptionStatus: null, stripeSubscriptionId: null })
  })

  it("Stripe Connect account state is the business's", async () => {
    const { garage, organisation } = await makeGarage(PREFIX)
    await updateBilling(garage.id, { stripeAccountId: `acct_${PREFIX}x` })
    await applyAccountState({ id: `acct_${PREFIX}x`, charges_enabled: true, payouts_enabled: true, details_submitted: true })
    expect(await org(organisation!.id)).toMatchObject({ stripeAccountId: `acct_${PREFIX}x`, stripeChargesEnabled: true })
    await applyAccountState({ id: `acct_${PREFIX}x`, charges_enabled: false, payouts_enabled: true, details_submitted: true })
    expect((await org(organisation!.id)).stripeChargesEnabled).toBe(false)
  })
})

describe("invoice numbers", () => {
  it("run on one sequence per business, across its locations", async () => {
    const { garage, second, organisation } = await twoLocations()
    const a = await makeWalkInBooking(garage.id, { status: "COMPLETED", completedAt: new Date() })
    const b = await makeWalkInBooking(second.id, { status: "COMPLETED", completedAt: new Date() })
    expect((await ensureInvoiceNumber(a.id, garage.id)).number).toBe("INV-0001")
    expect((await ensureInvoiceNumber(b.id, second.id)).number).toBe("INV-0002")
    expect((await org(organisation.id)).invoiceCounter).toBe(2)
    // Asking again returns the same number rather than drawing another.
    expect((await ensureInvoiceNumber(a.id, garage.id)).number).toBe("INV-0001")
    expect(await loc(second.id)).toMatchObject({ invoiceCounter: 2 })
  })
})

describe("syncOrganisationBilling (repair: garage columns -> business)", () => {
  it("copies the garage's billing onto its business", async () => {
    const { garage, organisation } = await makeGarage(PREFIX)
    await prisma.garage.update({ where: { id: garage.id }, data: { plan: "PRO", subscriptionStatus: "active", leadCredits: 4, invoiceCounter: 9, stripeCustomerId: `${PREFIX}cus`, stripeAccountId: `${PREFIX}acct`, stripeChargesEnabled: true } })
    expect(await syncOrganisationBilling(garage.id)).toBe(true)
    expect(await org(organisation!.id)).toMatchObject({ plan: "PRO", subscriptionStatus: "active", leadCredits: 4, invoiceCounter: 9, stripeCustomerId: `${PREFIX}cus`, stripeAccountId: `${PREFIX}acct`, stripeChargesEnabled: true })
  })

  it("does nothing for a garage with no business (legacy)", async () => {
    const { garage } = await makeGarage(PREFIX, { legacy: true })
    expect(await syncOrganisationBilling(garage.id)).toBe(false)
  })

  it("does nothing once a business has several locations: one location's figures must never overwrite a shared balance", async () => {
    const { garage, organisation } = await twoLocations()
    await prisma.garage.update({ where: { id: garage.id }, data: { plan: "PREMIUM", leadCredits: 50 } })
    expect(await syncOrganisationBilling(garage.id)).toBe(false)
    expect(await org(organisation.id)).toMatchObject({ plan: "FREE", leadCredits: 0 })
  })

  it("never throws, even when the write fails", async () => {
    const { garage, organisation } = await makeGarage(PREFIX)
    // Another business already owns this Stripe customer id, so the unique constraint rejects the copy.
    const other = await makeGarage(PREFIX, { key: "other" })
    await prisma.organisation.update({ where: { id: other.organisation!.id }, data: { stripeCustomerId: `${PREFIX}dup` } })
    await prisma.garage.update({ where: { id: garage.id }, data: { stripeCustomerId: `${PREFIX}dup` } })
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(syncOrganisationBilling(garage.id)).resolves.toBe(false)
    spy.mockRestore()
    expect((await org(organisation!.id)).stripeCustomerId).toBeNull()
  })
})
