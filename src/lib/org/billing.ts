import type { Garage, Prisma, PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/prisma"

// Billing belongs to the BUSINESS (plan, subscription, lead credits, Stripe Connect account, invoice numbers), but until
// every code path reads it from there the Garage columns stay the source of truth. So for now every billing write also
// keeps the business's copy fresh. That makes the later switch of authority a pure code change: no resync, no gap, and a
// rollback to older code loses nothing.
//
// It only mirrors for a business with exactly ONE location. With several, one location's figures must never be
// applied to the shared balance (who owns the credits then is the Organisation's, decided in a later phase).

type Db = PrismaClient | Prisma.TransactionClient

/** The billing fields that live on both a Garage and an Organisation. */
export const billingOf = (g: Pick<Garage, "plan" | "stripeCustomerId" | "stripeSubscriptionId" | "subscriptionStatus" | "subscriptionPeriodEnd" | "leadCredits" | "stripeAccountId" | "stripeChargesEnabled" | "invoiceCounter">) => ({
  plan: g.plan,
  stripeCustomerId: g.stripeCustomerId,
  stripeSubscriptionId: g.stripeSubscriptionId,
  subscriptionStatus: g.subscriptionStatus,
  subscriptionPeriodEnd: g.subscriptionPeriodEnd,
  leadCredits: g.leadCredits,
  stripeAccountId: g.stripeAccountId,
  stripeChargesEnabled: g.stripeChargesEnabled,
  invoiceCounter: g.invoiceCounter,
})

/** The business a location belongs to, or null for a garage that hasn't been backfilled. */
export async function organisationIdOf(garageId: string, db: Db = prisma): Promise<string | null> {
  return (await db.garage.findUnique({ where: { id: garageId }, select: { organisationId: true } }))?.organisationId ?? null
}

/**
 * Copies a garage's billing onto its business. Never throws and never blocks the real operation (a payment, a webhook):
 * a failed mirror is logged, and `npm run db:backfill-orgs -- --sync-billing` repairs it. Returns whether it mirrored.
 */
export async function syncOrganisationBilling(garageId: string, db: Db = prisma): Promise<boolean> {
  try {
    const garage = await db.garage.findUnique({ where: { id: garageId } })
    if (!garage?.organisationId) return false
    if ((await db.garage.count({ where: { organisationId: garage.organisationId } })) !== 1) return false
    await db.organisation.update({ where: { id: garage.organisationId }, data: billingOf(garage) })
    return true
  } catch (err) {
    console.error("[org-billing] couldn't mirror billing onto the business:", (err as Error).message)
    return false
  }
}
