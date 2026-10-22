import type { Garage, Prisma, PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { billingOf } from "@/lib/org/billing"
import { ensureOwnerMembership, ensureSystemRoles } from "@/lib/org/create"
import { SYSTEM_ROLES } from "@/lib/org/presets"
import { slugify } from "@/lib/utils"

// One-off, idempotent upgrade of garages that predate businesses: every Garage becomes the first location of its own
// Organisation, with the system roles and its login as the Owner. Safe to re-run (it only touches garages whose
// organisationId is still null, plus cheap catch-ups). Run it after the schema is pushed and again after the new code
// is deployed, to pick up garages registered by the old code in between. `npm run db:backfill-orgs`.
//
//   --dry-run        count what would change, write nothing
//   --sync-billing   for single-location businesses, copy billing from the Garage onto the Organisation (see below)
//   --verify         check the result instead of changing anything; exits non-zero if anything is wrong

type Db = PrismaClient | Prisma.TransactionClient

export interface BackfillResult {
  /** Garages that had no business. */
  scanned: number
  /** Businesses created. */
  created: number
  /** Messages (re)marked as sent from the garage side. */
  messagesFlagged: number
  /** Lead-credit rows given their business. */
  creditRowsLinked: number
  /** Single-location businesses whose billing was copied from the garage (only with syncBilling). */
  billingSynced: number
}

async function uniqueSlug(db: Db, name: string): Promise<string> {
  const base = slugify(name).slice(0, 60) || "business"
  let slug = base
  for (let n = 1; await db.organisation.findUnique({ where: { slug }, select: { id: true } }); n++) slug = `${base}-${n}`
  return slug
}

/** Upgrades one garage inside a transaction: business, roles, Owner membership, link, message flags. */
export async function backfillGarage(tx: Prisma.TransactionClient, garage: Garage): Promise<{ organisationId: string }> {
  const organisation = await tx.organisation.create({
    data: {
      name: garage.name,
      slug: await uniqueSlug(tx, garage.name),
      vatNumber: garage.vatNumber,
      logo: garage.logo,
      description: garage.description,
      website: garage.website,
      contactEmail: garage.email,
      contactPhone: garage.phone,
      ...billingOf(garage),
    },
  })
  const { ownerRoleId } = await ensureSystemRoles(tx, organisation.id)
  // A garage with no login has no one to make Owner; `--verify` reports such a business so it can be fixed by hand.
  if (garage.userId) await ensureOwnerMembership(tx, garage.userId, organisation.id, ownerRoleId)
  await tx.garage.update({ where: { id: garage.id }, data: { organisationId: organisation.id } })
  return { organisationId: organisation.id }
}

export interface BackfillOptions {
  dryRun?: boolean
  syncBilling?: boolean
  /** Limit everything to these garages (tests, or a one-garage repair). Default: all garages. */
  garageIds?: string[]
  db?: PrismaClient
}

export async function backfillOrganisations(opts: BackfillOptions = {}): Promise<BackfillResult> {
  const db = opts.db ?? prisma
  const result: BackfillResult = { scanned: 0, created: 0, messagesFlagged: 0, creditRowsLinked: 0, billingSynced: 0 }
  const scope = opts.garageIds ? { id: { in: opts.garageIds } } : {}

  const pending = await db.garage.findMany({ where: { organisationId: null, ...scope }, orderBy: { id: "asc" } })
  result.scanned = pending.length

  if (opts.dryRun) {
    result.created = pending.length
    for (const g of await db.garage.findMany({ where: scope, select: { id: true, userId: true } })) {
      if (g.userId) result.messagesFlagged += await db.message.count({ where: { garageId: g.id, senderId: g.userId, fromGarage: false } })
    }
    return result
  }

  for (const garage of pending) {
    await db.$transaction(async (tx) => {
      await backfillGarage(tx, garage)
    })
    result.created++
  }

  // Catch-ups, cheap and idempotent. Run for every garage, so a re-run after the deploy also fixes rows the OLD code
  // wrote in the meantime (a message sent by the owner login, a credit purchase).
  const garages = await db.garage.findMany({ where: { organisationId: { not: null }, ...scope }, select: { id: true, userId: true, organisationId: true } })
  for (const g of garages) {
    if (g.userId) {
      const flagged = await db.message.updateMany({ where: { garageId: g.id, senderId: g.userId, fromGarage: false }, data: { fromGarage: true } })
      result.messagesFlagged += flagged.count
    }
    const linked = await db.leadCreditTransaction.updateMany({ where: { garageId: g.id, organisationId: null }, data: { organisationId: g.organisationId } })
    result.creditRowsLinked += linked.count
  }

  if (opts.syncBilling) {
    // While a business has ONE location, the garage's billing is the truth until the new code is live (the old code only
    // wrote there). Copy it across so the Organisation isn't left with a stale plan or credit balance. Never run it once
    // businesses have several locations: then the Organisation is the only truth and the garage columns are a mirror.
    const orgs = await db.organisation.findMany({ where: opts.garageIds ? { locations: { some: scope } } : {}, select: { id: true, locations: { select: { id: true } } } })
    for (const org of orgs) {
      if (org.locations.length !== 1) continue
      const garage = await db.garage.findUnique({ where: { id: org.locations[0].id } })
      if (!garage) continue
      await db.organisation.update({ where: { id: org.id }, data: billingOf(garage) })
      result.billingSynced++
    }
  }
  return result
}

export interface VerifyResult {
  ok: boolean
  problems: string[]
  counts: { garages: number; organisations: number; memberships: number }
}

/** Checks the invariants the rest of the code relies on. Read-only. `garageIds` limits it to those garages' businesses. */
export async function verifyOrganisations(db: PrismaClient = prisma, opts: { garageIds?: string[] } = {}): Promise<VerifyResult> {
  const problems: string[] = []
  const scope = opts.garageIds ? { id: { in: opts.garageIds } } : {}

  const orphans = await db.garage.count({ where: { organisationId: null, ...scope } })
  if (orphans) problems.push(`${orphans} garage(s) have no business (run the backfill)`)

  const systemKeys = SYSTEM_ROLES.map((r) => r.key)
  const orgs = await db.organisation.findMany({
    where: opts.garageIds ? { locations: { some: scope } } : {},
    select: { id: true, name: true, roles: { where: { presetKey: { in: systemKeys } }, select: { presetKey: true, id: true } }, locations: { select: { id: true } } },
  })
  for (const org of orgs) {
    const have = new Set(org.roles.map((r) => r.presetKey))
    const missing = systemKeys.filter((k) => !have.has(k))
    if (missing.length) problems.push(`business "${org.name}" is missing system role(s): ${missing.join(", ")}`)
    if (org.locations.length === 0) problems.push(`business "${org.name}" has no locations`)

    const ownerRole = org.roles.find((r) => r.presetKey === "owner")
    if (ownerRole) {
      const owners = await db.roleAssignment.count({ where: { roleId: ownerRole.id, scopeKey: "*", membership: { status: "ACTIVE" } } })
      if (owners === 0) problems.push(`business "${org.name}" has no active Owner`)
    }
  }

  const wrongRole = await db.membership.count({
    where: { status: "ACTIVE", user: { role: { notIn: ["GARAGE"] } }, ...(opts.garageIds ? { organisation: { locations: { some: scope } } } : {}) },
  })
  if (wrongRole) problems.push(`${wrongRole} active member(s) don't have the GARAGE login role (they couldn't sign in to the portal)`)

  // Messages sent by a garage's own login before `fromGarage` existed. (Checked per garage, by that garage's login: a
  // converted customer account has genuine customer messages that must stay unflagged.)
  let unflagged = 0
  for (const g of await db.garage.findMany({ where: scope, select: { id: true, userId: true } })) {
    if (g.userId) unflagged += await db.message.count({ where: { garageId: g.id, senderId: g.userId, fromGarage: false } })
  }
  if (unflagged) problems.push(`${unflagged} message(s) from garage logins aren't flagged as sent by the garage (run the backfill)`)

  const [garages, organisations, memberships] = await Promise.all([
    db.garage.count({ where: scope }),
    db.organisation.count({ where: opts.garageIds ? { locations: { some: scope } } : {} }),
    db.membership.count({ where: opts.garageIds ? { organisation: { locations: { some: scope } } } : {} }),
  ])
  return { ok: problems.length === 0, problems, counts: { garages, organisations, memberships } }
}
