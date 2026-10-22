import type Stripe from "stripe"
import { prisma } from "@/lib/prisma"
import { getStripe } from "@/lib/stripe"
import { absoluteUrl } from "@/lib/portal/links"
import { billingOwnerOf, claimStripeId, getBilling, mirrorBillingToLocations } from "@/lib/org/billing"

const RETURN_PATH = "/garage-dashboard/website"

/** Can this connected account take card payments and be paid out? Stripe is the source of truth. */
export const canTakePayments = (a: Pick<Stripe.Account, "charges_enabled" | "payouts_enabled" | "details_submitted">) =>
  Boolean(a.charges_enabled && a.payouts_enabled && a.details_submitted)

/**
 * Begin (or resume) Stripe Express onboarding for a garage's BUSINESS and return the hosted onboarding URL. One account is
 * created per business and reused: a business that abandoned onboarding picks up where it left off instead of getting a
 * second account, and every location's deposits go to it.
 */
export async function startConnectOnboarding(garage: { id: string; email: string; name: string }): Promise<string> {
  const stripe = getStripe()
  if (!stripe) throw new Error("Stripe is not configured")

  let accountId = (await getBilling(garage.id)).stripeAccountId
  if (!accountId) {
    const owner = await billingOwnerOf(garage.id)
    const account = await stripe.accounts.create({
      type: "express",
      country: "GB",
      email: garage.email,
      business_profile: { name: garage.name },
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { garageId: garage.id, ...("organisationId" in owner ? { organisationId: owner.organisationId } : {}) },
    })
    accountId = account.id
    // Claimed only while unset, so two clicks in a row can't attach different accounts to one business.
    if (!(await claimStripeId(owner, "stripeAccountId", accountId))) {
      accountId = (await getBilling(garage.id)).stripeAccountId!
    }
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: absoluteUrl(`${RETURN_PATH}?stripe=refresh`),
    return_url: absoluteUrl(`${RETURN_PATH}?stripe=return`),
  })
  return link.url
}

/** Update the owner of a connected account (its business, or a garage with none) from a Stripe account object. Returns the new state. */
export async function applyAccountState(account: Pick<Stripe.Account, "id" | "charges_enabled" | "payouts_enabled" | "details_submitted">): Promise<boolean> {
  const enabled = canTakePayments(account)
  const orgs = await prisma.organisation.findMany({ where: { stripeAccountId: account.id }, select: { id: true } })
  if (orgs.length > 0) {
    await prisma.organisation.updateMany({ where: { stripeAccountId: account.id }, data: { stripeChargesEnabled: enabled } })
    for (const o of orgs) await mirrorBillingToLocations(o.id)
  }
  // A garage that hasn't been backfilled into a business keeps its own flag.
  await prisma.garage.updateMany({ where: { stripeAccountId: account.id, organisationId: null }, data: { stripeChargesEnabled: enabled } })
  return enabled
}

/** Re-read the business's account from Stripe (used when it returns from onboarding, before any webhook has arrived). */
export async function refreshConnectStatus(garage: { id: string }): Promise<{ connected: boolean; enabled: boolean }> {
  const accountId = (await getBilling(garage.id)).stripeAccountId
  if (!accountId) return { connected: false, enabled: false }
  const stripe = getStripe()
  if (!stripe) return { connected: true, enabled: false }
  const account = await stripe.accounts.retrieve(accountId)
  return { connected: true, enabled: await applyAccountState(account) }
}
