import type Stripe from "stripe"
import { prisma } from "@/lib/prisma"
import { getStripe } from "@/lib/stripe"
import { notifyGarage } from "@/lib/notifications"
import { absoluteUrl } from "@/lib/portal/links"
import { CREDIT_PACK, extendFeatured, FEATURED_PRODUCT, isPlanId, PLANS, type PlanId } from "@/lib/portal/plans"

// What the platform charges garages: monthly plans (Stripe Billing), pay-per-lead credit packs and featured
// placement (one-off Checkout payments). All charged to the platform's own Stripe account, not the garage's
// Connect account (that one is for customer deposits).

const RETURN_PATH = "/garage-dashboard/billing"

type BillingGarage = { id: string; email: string; name: string; stripeCustomerId: string | null }

/** The garage's Stripe customer, created on first use. Claimed only while unset so two clicks can't make two customers. */
export async function ensureCustomer(garage: BillingGarage): Promise<string> {
  const stripe = getStripe()
  if (!stripe) throw new Error("Stripe is not configured")
  if (garage.stripeCustomerId) return garage.stripeCustomerId

  const customer = await stripe.customers.create({ email: garage.email, name: garage.name, metadata: { garageId: garage.id } })
  const claimed = await prisma.garage.updateMany({ where: { id: garage.id, stripeCustomerId: null }, data: { stripeCustomerId: customer.id } })
  if (claimed.count === 0) {
    // Lost the race: use the winner's customer and discard ours.
    await stripe.customers.del(customer.id).catch(() => {})
    return (await prisma.garage.findUniqueOrThrow({ where: { id: garage.id }, select: { stripeCustomerId: true } })).stripeCustomerId!
  }
  return customer.id
}

export class BillingError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
  }
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
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    metadata: { kind: "subscription", garageId: garage.id, plan },
    subscription_data: { metadata: { garageId: garage.id, plan } },
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
    metadata: { kind, garageId: garage.id },
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

/** Copy a subscription's state onto the garage it belongs to. A cancelled subscription drops the garage back to FREE. */
export async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id
  const garage = await prisma.garage.findFirst({
    where: { OR: [{ stripeCustomerId: customerId }, ...(sub.metadata?.garageId ? [{ id: sub.metadata.garageId }] : [])] },
  })
  if (!garage) return

  const priceId = sub.items?.data?.[0]?.price?.id
  const plan = planForPriceId(priceId) ?? (isPlanId(sub.metadata?.plan) ? sub.metadata.plan : null)
  const ended = sub.status === "canceled" || sub.status === "incomplete_expired"

  await prisma.garage.update({
    where: { id: garage.id },
    data: {
      stripeCustomerId: garage.stripeCustomerId ?? customerId,
      stripeSubscriptionId: ended ? null : sub.id,
      subscriptionStatus: ended ? null : sub.status,
      subscriptionPeriodEnd: ended ? null : periodEnd(sub),
      plan: ended || !plan ? (ended ? "FREE" : garage.plan) : plan,
    },
  })
}

/** A one-off payment (credits or featured placement) completed. The event id was already de-duplicated by the caller. */
export async function fulfilCheckout(session: Stripe.Checkout.Session, now = new Date()): Promise<void> {
  const kind = session.metadata?.kind
  const garageId = session.metadata?.garageId
  if (!garageId || session.payment_status !== "paid") return

  if (kind === "credits") {
    try {
      // The unique session id makes this grant happen once even if the event is redelivered under a new event id.
      await prisma.$transaction([
        prisma.leadCreditTransaction.create({ data: { garageId, delta: CREDIT_PACK.credits, reason: "PURCHASE", stripeSessionId: session.id } }),
        prisma.garage.update({ where: { id: garageId }, data: { leadCredits: { increment: CREDIT_PACK.credits } } }),
      ])
    } catch (err: any) {
      if (err?.code === "P2002") return
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
  const taken = await prisma.garage.updateMany({ where: { id: garageId, leadCredits: { gt: 0 } }, data: { leadCredits: { decrement: 1 } } })
  if (taken.count === 0) return false
  await prisma.leadCreditTransaction.create({ data: { garageId, delta: -1, reason: "LEAD", jobRequestId } })
  return true
}

/** Give back a credit spent on an answer that then failed to save. */
export async function refundLeadCredit(garageId: string, jobRequestId: string): Promise<void> {
  await prisma.garage.update({ where: { id: garageId }, data: { leadCredits: { increment: 1 } } })
  await prisma.leadCreditTransaction.create({ data: { garageId, delta: 1, reason: "REFUND", jobRequestId } })
}
