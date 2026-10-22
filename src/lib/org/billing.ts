import type { Garage, Prisma, PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/prisma"

// Billing belongs to the BUSINESS: one plan, one Stripe customer and subscription, one pool of lead credits, one
// Connect account for deposits, one invoice sequence, shared by all its locations.
//
//   * The Organisation row is the source of truth. Every billing WRITE goes there first.
//   * It is then mirrored onto the locations' Garage columns, so code that still reads `garage.plan` or
//     `garage.leadCredits` sees the right value. Those columns are display copies; never decide anything from them
//     where it matters (lead limits, deposits, Connect): use getBilling().
//   * `stripeCustomerId`, `stripeSubscriptionId` and `stripeAccountId` are UNIQUE on Garage, so a business with several
//     locations can only carry them on one (its original, oldest location). Everything else is mirrored to all.
//   * A garage with no business yet (not backfilled) is its own billing owner, exactly as before.

type Db = PrismaClient | Prisma.TransactionClient

type BillingKeys = "plan" | "stripeCustomerId" | "stripeSubscriptionId" | "subscriptionStatus" | "subscriptionPeriodEnd" | "leadCredits" | "stripeAccountId" | "stripeChargesEnabled" | "invoiceCounter"
export type BillingFields = Pick<Garage, BillingKeys>

/** The billing fields that live on both a Garage and an Organisation. */
export const billingOf = (g: BillingFields): BillingFields => ({
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

const BILLING_SELECT = { plan: true, stripeCustomerId: true, stripeSubscriptionId: true, subscriptionStatus: true, subscriptionPeriodEnd: true, leadCredits: true, stripeAccountId: true, stripeChargesEnabled: true, invoiceCounter: true } as const

/** Who owns a garage's billing: its business, or (not backfilled yet) the garage itself. */
export type BillingOwner = { organisationId: string } | { garageId: string }

/** The business a location belongs to, or null for a garage that hasn't been backfilled. */
export async function organisationIdOf(garageId: string, db: Db = prisma): Promise<string | null> {
  return (await db.garage.findUnique({ where: { id: garageId }, select: { organisationId: true } }))?.organisationId ?? null
}

export async function billingOwnerOf(garageId: string, db: Db = prisma): Promise<BillingOwner> {
  const organisationId = await organisationIdOf(garageId, db)
  return organisationId ? { organisationId } : { garageId }
}

/** The billing state that counts: the business's, or the garage's own when it has no business. */
export async function getBilling(garageId: string, db: Db = prisma): Promise<BillingFields & { organisationId: string | null }> {
  const g = await db.garage.findUniqueOrThrow({ where: { id: garageId }, select: { ...BILLING_SELECT, organisationId: true, organisation: { select: BILLING_SELECT } } })
  return g.organisation ? { ...g.organisation, organisationId: g.organisationId } : { ...billingOf(g), organisationId: null }
}

/** The billing state of a known owner. */
export async function readBilling(owner: BillingOwner, db: Db = prisma): Promise<BillingFields> {
  return "organisationId" in owner
    ? db.organisation.findUniqueOrThrow({ where: { id: owner.organisationId }, select: BILLING_SELECT })
    : db.garage.findUniqueOrThrow({ where: { id: owner.garageId }, select: BILLING_SELECT })
}

/** Every location of the business a garage belongs to (just the garage when it has none). Used for pooled counts. */
export async function locationIdsOf(garageId: string, db: Db = prisma): Promise<string[]> {
  const orgId = await organisationIdOf(garageId, db)
  if (!orgId) return [garageId]
  return (await db.garage.findMany({ where: { organisationId: orgId }, select: { id: true } })).map((g) => g.id)
}

/**
 * Copies the business's billing onto its locations. Never throws: the business already holds the truth, so a failed
 * mirror is only a stale display copy, logged and repairable by running the billing mirror again.
 */
export async function mirrorBillingToLocations(organisationId: string, db: Db = prisma): Promise<void> {
  try {
    const org = await db.organisation.findUnique({ where: { id: organisationId }, select: BILLING_SELECT })
    if (!org) return
    const { stripeCustomerId, stripeSubscriptionId, stripeAccountId, ...shared } = org
    await db.garage.updateMany({ where: { organisationId }, data: shared })
    const primary = await db.garage.findFirst({ where: { organisationId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } })
    if (primary) await db.garage.update({ where: { id: primary.id }, data: { stripeCustomerId, stripeSubscriptionId, stripeAccountId } })
  } catch (err) {
    console.error("[org-billing] couldn't mirror billing onto the locations:", (err as Error).message)
  }
}

/** Writes billing fields to their owner (business first, then mirrored). Returns nothing; throws if the write itself fails. */
export async function writeBilling(owner: BillingOwner, patch: Partial<BillingFields>, db: Db = prisma): Promise<void> {
  if ("organisationId" in owner) {
    await db.organisation.update({ where: { id: owner.organisationId }, data: patch })
    await mirrorBillingToLocations(owner.organisationId, db)
  } else {
    await db.garage.update({ where: { id: owner.garageId }, data: patch })
  }
}

/** Convenience: write the billing of whoever owns `garageId`. */
export async function updateBilling(garageId: string, patch: Partial<BillingFields>, db: Db = prisma): Promise<void> {
  await writeBilling(await billingOwnerOf(garageId, db), patch, db)
}

/** Adds (or, negative, takes) lead credits. Atomic. */
export async function addCredits(owner: BillingOwner, delta: number, db: Db = prisma): Promise<void> {
  if ("organisationId" in owner) {
    await db.organisation.update({ where: { id: owner.organisationId }, data: { leadCredits: { increment: delta } } })
    await mirrorBillingToLocations(owner.organisationId, db)
  } else {
    await db.garage.update({ where: { id: owner.garageId }, data: { leadCredits: { increment: delta } } })
  }
}

/** Takes one lead credit if there is one. Atomic, so two answers can't both spend the last. */
export async function takeCredit(owner: BillingOwner, db: Db = prisma): Promise<boolean> {
  if ("organisationId" in owner) {
    const taken = await db.organisation.updateMany({ where: { id: owner.organisationId, leadCredits: { gt: 0 } }, data: { leadCredits: { decrement: 1 } } })
    if (taken.count === 0) return false
    await mirrorBillingToLocations(owner.organisationId, db)
    return true
  }
  return (await db.garage.updateMany({ where: { id: owner.garageId, leadCredits: { gt: 0 } }, data: { leadCredits: { decrement: 1 } } })).count > 0
}

/** Claims a Stripe id only while it is unset, so two clicks in a row can't attach different accounts. True if this call set it. */
export async function claimStripeId(owner: BillingOwner, field: "stripeCustomerId" | "stripeAccountId", value: string, db: Db = prisma): Promise<boolean> {
  if ("organisationId" in owner) {
    const claimed = await db.organisation.updateMany({ where: { id: owner.organisationId, [field]: null }, data: { [field]: value } })
    if (claimed.count > 0) await mirrorBillingToLocations(owner.organisationId, db)
    return claimed.count > 0
  }
  return (await db.garage.updateMany({ where: { id: owner.garageId, [field]: null }, data: { [field]: value } })).count > 0
}

/** Draws the next invoice number's counter value for a business (or its garage). Call inside the invoice transaction. */
export async function nextInvoiceCounter(garageId: string, tx: Prisma.TransactionClient): Promise<number> {
  const orgId = await organisationIdOf(garageId, tx)
  if (orgId) return (await tx.organisation.update({ where: { id: orgId }, data: { invoiceCounter: { increment: 1 } }, select: { invoiceCounter: true } })).invoiceCounter
  return (await tx.garage.update({ where: { id: garageId }, data: { invoiceCounter: { increment: 1 } }, select: { invoiceCounter: true } })).invoiceCounter
}

/** Lead-credit rows for a business's pool: every location's, plus rows already filed under the business. */
export async function creditHistoryWhere(garageId: string, db: Db = prisma): Promise<Prisma.LeadCreditTransactionWhereInput> {
  const orgId = await organisationIdOf(garageId, db)
  return orgId ? { OR: [{ organisationId: orgId }, { garage: { organisationId: orgId } }] } : { garageId }
}

// ---- Phase 1 helper, kept for the repair path ---------------------------------------------------------------------

/**
 * Repair: copy a garage's own billing columns onto its business, only for a single-location business. Used by
 * `db:backfill-orgs --sync-billing` after the rollout, when the garage columns were still the truth. Never throws.
 */
export async function syncOrganisationBilling(garageId: string, db: Db = prisma): Promise<boolean> {
  try {
    const garage = await db.garage.findUnique({ where: { id: garageId } })
    if (!garage?.organisationId) return false
    if ((await db.garage.count({ where: { organisationId: garage.organisationId } })) !== 1) return false
    await db.organisation.update({ where: { id: garage.organisationId }, data: billingOf(garage) })
    return true
  } catch (err) {
    console.error("[org-billing] couldn't copy billing onto the business:", (err as Error).message)
    return false
  }
}
