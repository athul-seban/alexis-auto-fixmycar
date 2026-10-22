import type Stripe from "stripe"
import { prisma } from "@/lib/prisma"
import { getStripe } from "@/lib/stripe"
import { notifyGarage } from "@/lib/notifications"
import { errorCode } from "@/lib/errors"
import { absoluteUrl } from "@/lib/portal/links"
import { CREDIT_PACK, extendFeatured, FEATURED_PRODUCT, isPlanId, PLANS, type PlanId } from "@/lib/portal/plans"
import { addCredits, billingOwnerOf, claimStripeId, getBilling, mirrorBillingToLocations, organisationIdOf, readBilling, takeCredit, writeBilling, type BillingOwner } from "@/lib/org/billing"

// What the platform charges garages: monthly plans (Stripe Billing), pay-per-lead credit packs and featured
// placement (one-off Checkout payments). All charged to the platform's own Stripe account, not the garage's
// Connect account (that one is for customer deposits).

const RETURN_PATH = "/garage-dashboard/billing"

type BillingGarage = { id: string; email: string; name: string; organisationId?: string | null }

/**
 * The BUSINESS's Stripe customer (the garage's own when it has no business), created on first use. Claimed only while
 * unset so two clicks can't make two customers, whichever location they come from.
 */
export async function ensureCustomer(garage: BillingGarage): Promise<string> {
  const stripe = getStripe()
  if (!stripe) throw new Error("Stripe is not configured")
  const existing = (await getBilling(garage.id)).stripeCustomerId
  if (existing) return existing

  const owner = await billingOwnerOf(garage.id)
  const customer = await stripe.customers.create({ email: garage.email, name: garage.name, metadata: { garageId: garage.id, ...("organisationId" in owner ? { organisationId: owner.organisationId } : {}) } })
  if (!(await claimStripeId(owner, "stripeCustomerId", customer.id))) {
    // Lost the race: use the winner's customer and discard ours.
    await stripe.customers.del(customer.id).catch(() => {})
    return (await getBilling(garage.id)).stripeCustomerId!
  }
  return customer.id
}

export class BillingError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
  }
}

/**
 * What Stripe is told so a webhook can find who a payment is for: the business (which owns the plan, credits and pool)
 * and the location the click came from (which a featured placement belongs to). Old checkouts carry only garageId.
 */
async function stripeMetadata(garageId: string): Promise<Record<string, string>> {
  const organisationId = await organisationIdOf(garageId)
  return { garageId, ...(organisationId ? { organisationId } : {}) }
}

const priceIdFor = (plan: PlanId): string | null => {
  const env = PLANS[plan].priceEnv
  return env ? (process.env[env] ?? null) : null
}

/** Which plan a Stripe price id belongs to, or null when it isn't one of ours. */
export function planForPriceId(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null
  return (Object.keys(PLANS) as PlanId[]).find((p) => priceIdFor(p) === priceId) ?? null
}

export async function createSubscriptionCheckout(garage: BillingGarage, plan: PlanId): Promise<string> {
  const stripe = getStripe()
  if (!stripe) throw new BillingError("Billing isn't set up on this platform yet.", "BILLING_UNAVAILABLE")
  const price = priceIdFor(plan)
  if (plan === "FREE" || !price) throw new BillingError("That plan isn't available to subscribe to.", "PLAN_UNAVAILABLE")

  const customer = await ensureCustomer(garage)
  const ids = await stripeMetadata(garage.id)
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    metadata: { kind: "subscription", ...ids, plan },
    subscription_data: { metadata: { ...ids, plan } },
    success_url: absoluteUrl(`${RETURN_PATH}?billing=success`),
    cancel_url: absoluteUrl(`${RETURN_PATH}?billing=cancelled`),
  })
  if (!session.url) throw new Error("Stripe returned a checkout session without a URL")
  return session.url
}

/** Stripe's hosted page for changing card, switching plan, cancelling and downloading invoices. */
export async function createBillingPortal(garage: BillingGarage): Promise<string> {
  const stripe = getStripe()
  if (!stripe) throw new BillingError("Billing isn't set up on this platform yet.", "BILLING_UNAVAILABLE")
  const customer = await ensureCustomer(garage)
  const session = await stripe.billingPortal.sessions.create({ customer, return_url: absoluteUrl(RETURN_PATH) })
  return session.url
}

async function oneOffCheckout(garage: BillingGarage, kind: "credits" | "featured", name: string, pence: number): Promise<string> {
  const stripe = getStripe()
  if (!stripe) throw new BillingError("Billing isn't set up on this platform yet.", "BILLING_UNAVAILABLE")
  const customer = await ensureCustomer(garage)
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer,
    line_items: [{ quantity: 1, price_data: { currency: "gbp", unit_amount: pence, product_data: { name } } }],
    metadata: { kind, ...(await stripeMetadata(garage.id)) },
    success_url: absoluteUrl(`${RETURN_PATH}?billing=${kind}`),
    cancel_url: absoluteUrl(`${RETURN_PATH}?billing=cancelled`),
  })
  if (!session.url) throw new Error("Stripe returned a checkout session without a URL")
  return session.url
}

export const createCreditsCheckout = (garage: BillingGarage) => oneOffCheckout(garage, "credits", CREDIT_PACK.label, CREDIT_PACK.pricePence)
export const createFeaturedCheckout = (garage: BillingGarage) => oneOffCheckout(garage, "featured", FEATURED_PRODUCT.label, FEATURED_PRODUCT.pricePence)

// ---- Webhook handling (called from handleStripeEvent, which has already de-duplicated the event) ----

const periodEnd = (sub: Stripe.Subscription): Date | null => {
  const s = sub as unknown as { current_period_end?: number; items?: { data?: { current_period_end?: number }[] } }
  const unix = s.current_period_end ?? s.items?.data?.[0]?.current_period_end
  return unix ? new Date(unix * 1000) : null
}

/**
 * Who a Stripe subscription belongs to. Tried in order: a business that holds this Stripe customer, the business named in
 * the metadata, then (checkouts started before businesses existed) a garage by customer or id, resolved to its business.
 */
async function findSubscriptionOwner(customerId: string, metadata: Stripe.Metadata | null | undefined): Promise<BillingOwner | null> {
  const org = await prisma.organisation.findFirst({ where: { OR: [{ stripeCustomerId: customerId }, ...(metadata?.organisationId ? [{ id: metadata.organisationId }] : [])] }, select: { id: true } })
  if (org) return { organisationId: org.id }
  const garage = await prisma.garage.findFirst({ where: { OR: [{ stripeCustomerId: customerId }, ...(metadata?.garageId ? [{ id: metadata.garageId }] : [])] }, select: { id: true, organisationId: true } })
  if (!garage) return null
  return garage.organisationId ? { organisationId: garage.organisationId } : { garageId: garage.id }
}

/** Copy a subscription's state onto the business it belongs to. A cancelled subscription drops it back to FREE. */
export async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id
  const owner = await findSubscriptionOwner(customerId, sub.metadata)
  if (!owner) return

  const current = await readBilling(owner)
  const priceId = sub.items?.data?.[0]?.price?.id
  const plan = planForPriceId(priceId) ?? (isPlanId(sub.metadata?.plan) ? sub.metadata.plan : null)
  const ended = sub.status === "canceled" || sub.status === "incomplete_expired"

  await writeBilling(owner, {
    stripeCustomerId: current.stripeCustomerId ?? customerId,
    stripeSubscriptionId: ended ? null : sub.id,
    subscriptionStatus: ended ? null : sub.status,
    subscriptionPeriodEnd: ended ? null : periodEnd(sub),
    plan: ended || !plan ? (ended ? "FREE" : current.plan) : plan,
  })
}

/** A one-off payment (credits or featured placement) completed. The event id was already de-duplicated by the caller. */
export async function fulfilCheckout(session: Stripe.Checkout.Session, now = new Date()): Promise<void> {
  const kind = session.metadata?.kind
  const garageId = session.metadata?.garageId
  if (!garageId || session.payment_status !== "paid") return

  if (kind === "credits") {
    try {
      // The unique session id makes this grant happen once even if the event is redelivered under a new event id. The
      // credits go to the business's pool (the garage's own balance when it has no business).
      const organisationId = await organisationIdOf(garageId)
      await prisma.$transaction([
        prisma.leadCreditTransaction.create({ data: { garageId, organisationId, delta: CREDIT_PACK.credits, reason: "PURCHASE", stripeSessionId: session.id } }),
        organisationId
          ? prisma.organisation.update({ where: { id: organisationId }, data: { leadCredits: { increment: CREDIT_PACK.credits } } })
          : prisma.garage.update({ where: { id: garageId }, data: { leadCredits: { increment: CREDIT_PACK.credits } } }),
      ])
      if (organisationId) await mirrorBillingToLocations(organisationId)
    } catch (err) {
      if (errorCode(err) === "P2002") return
      throw err
    }
    await notifyGarage({ garageId, type: "GARAGE_STATUS_CHANGED", title: "Lead credits added", body: `${CREDIT_PACK.credits} credits are ready to use.`, link: "/garage-dashboard/billing" })
  } else if (kind === "featured") {
    const garage = await prisma.garage.findUnique({ where: { id: garageId }, select: { featuredUntil: true } })
    if (!garage) return
    const until = extendFeatured(garage.featuredUntil, now)
    await prisma.garage.update({ where: { id: garageId }, data: { featuredUntil: until } })
    await notifyGarage({ garageId, type: "GARAGE_STATUS_CHANGED", title: "You're featured", body: `Your listing is featured until ${until.toLocaleDateString("en-GB")}.`, link: "/garage-dashboard/billing" })
  }
}

export async function handleBillingEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applySubscription(event.data.object as Stripe.Subscription)
      break
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await fulfilCheckout(event.data.object as Stripe.Checkout.Session)
      break
  }
}

/** Take one lead credit, recording why. Returns false when the garage has none left (so two answers can't both spend the last). */
export async function spendLeadCredit(garageId: string, jobRequestId: string): Promise<boolean> {
  const owner = await billingOwnerOf(garageId)
  if (!(await takeCredit(owner))) return false
  await prisma.leadCreditTransaction.create({ data: { garageId, organisationId: "organisationId" in owner ? owner.organisationId : null, delta: -1, reason: "LEAD", jobRequestId } })
  return true
}

/** Give back a credit spent on an answer that then failed to save. */
export async function refundLeadCredit(garageId: string, jobRequestId: string): Promise<void> {
  const owner = await billingOwnerOf(garageId)
  await addCredits(owner, 1)
  await prisma.leadCreditTransaction.create({ data: { garageId, organisationId: "organisationId" in owner ? owner.organisationId : null, delta: 1, reason: "REFUND", jobRequestId } })
}
