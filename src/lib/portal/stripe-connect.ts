import type Stripe from "stripe"
import { prisma } from "@/lib/prisma"
import { getStripe } from "@/lib/stripe"
import { absoluteUrl } from "@/lib/portal/links"

const RETURN_PATH = "/garage-dashboard/website"

/** Can this connected account take card payments and be paid out? Stripe is the source of truth. */
export const canTakePayments = (a: Pick<Stripe.Account, "charges_enabled" | "payouts_enabled" | "details_submitted">) =>
  Boolean(a.charges_enabled && a.payouts_enabled && a.details_submitted)

/**
 * Begin (or resume) Stripe Express onboarding for a garage and return the hosted onboarding URL. The account is created
 * once and reused: a garage that abandoned onboarding picks up where it left off instead of getting a second account.
 */
export async function startConnectOnboarding(garage: { id: string; email: string; name: string; stripeAccountId: string | null }): Promise<string> {
  const stripe = getStripe()
  if (!stripe) throw new Error("Stripe is not configured")

  let accountId = garage.stripeAccountId
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "GB",
      email: garage.email,
      business_profile: { name: garage.name },
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { garageId: garage.id },
    })
    accountId = account.id
    // Claimed only while unset, so two clicks in a row can't attach different accounts to one garage.
    const claimed = await prisma.garage.updateMany({ where: { id: garage.id, stripeAccountId: null }, data: { stripeAccountId: accountId } })
    if (claimed.count === 0) {
      accountId = (await prisma.garage.findUniqueOrThrow({ where: { id: garage.id }, select: { stripeAccountId: true } })).stripeAccountId!
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

/** Update a garage's flags from a Stripe account object (from a webhook or a direct fetch). Returns the new state. */
export async function applyAccountState(account: Pick<Stripe.Account, "id" | "charges_enabled" | "payouts_enabled" | "details_submitted">): Promise<boolean> {
  const enabled = canTakePayments(account)
  await prisma.garage.updateMany({ where: { stripeAccountId: account.id }, data: { stripeChargesEnabled: enabled } })
  return enabled
}

/** Re-read the garage's account from Stripe (used when it returns from onboarding, before any webhook has arrived). */
export async function refreshConnectStatus(garage: { id: string; stripeAccountId: string | null }): Promise<{ connected: boolean; enabled: boolean }> {
  if (!garage.stripeAccountId) return { connected: false, enabled: false }
  const stripe = getStripe()
  if (!stripe) return { connected: true, enabled: false }
  const account = await stripe.accounts.retrieve(garage.stripeAccountId)
  return { connected: true, enabled: await applyAccountState(account) }
}
