import type { Prisma, PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { permissionsToJson } from "@/lib/org/permissions"
import { OWNER_ROLE_KEY, SYSTEM_ROLES } from "@/lib/org/presets"
import { ALL_LOCATIONS } from "@/lib/org/access"
import { slugify } from "@/lib/utils"

// Creating a garage business. Every path that makes a garage (self-registration, admin invite, seeds, the backfill of
// existing garages) goes through here, so a location can never exist without its business, roles and Owner.

/** A Prisma client or the transaction client inside prisma.$transaction. */
export type Db = PrismaClient | Prisma.TransactionClient

/** Creates any of the three system roles (owner, manager, staff) a business is missing. Safe to call repeatedly. */
export async function ensureSystemRoles(db: Db, organisationId: string): Promise<{ ownerRoleId: string }> {
  const existing = await db.role.findMany({ where: { organisationId, presetKey: { in: SYSTEM_ROLES.map((r) => r.key) } }, select: { id: true, presetKey: true } })
  const have = new Set(existing.map((r) => r.presetKey))
  for (const tpl of SYSTEM_ROLES) {
    if (have.has(tpl.key)) continue
    const created = await db.role.create({
      data: {
        organisationId,
        presetKey: tpl.key,
        name: tpl.name,
        description: tpl.description,
        permissions: permissionsToJson(tpl.permissions),
        isSystem: true,
        isEnabled: true,
        presetVersion: tpl.version,
      },
      select: { id: true, presetKey: true },
    })
    existing.push(created)
  }
  const owner = existing.find((r) => r.presetKey === OWNER_ROLE_KEY)
  if (!owner) throw new Error("ensureSystemRoles: owner role missing") // unreachable: SYSTEM_ROLES always contains it
  return { ownerRoleId: owner.id }
}

/** Makes `userId` an Owner (the Owner role at every location) of the business. Safe to call repeatedly. */
export async function ensureOwnerMembership(db: Db, userId: string, organisationId: string, ownerRoleId: string) {
  const membership = await db.membership.upsert({
    where: { userId_organisationId: { userId, organisationId } },
    create: { userId, organisationId, status: "ACTIVE" },
    update: {},
  })
  await db.roleAssignment.upsert({
    where: { membershipId_roleId_scopeKey: { membershipId: membership.id, roleId: ownerRoleId, scopeKey: ALL_LOCATIONS } },
    create: { membershipId: membership.id, roleId: ownerRoleId, garageId: null, scopeKey: ALL_LOCATIONS },
    update: {},
  })
  return membership
}

async function uniqueOrganisationSlug(db: Db, name: string): Promise<string> {
  const base = slugify(name).slice(0, 60) || "business"
  let slug = base
  for (let n = 1; await db.organisation.findUnique({ where: { slug }, select: { id: true } }); n++) slug = `${base}-${n}`
  return slug
}

export type NewLocation = Omit<Prisma.GarageUncheckedCreateInput, "userId" | "organisationId">

export interface CreateBusinessInput {
  /** The owner's login: an existing user (by id) or the fields of a new one. A new user gets role GARAGE. */
  owner: { userId: string } | { data: Omit<Prisma.UserCreateInput, "role"> }
  /** Defaults to the first location's name and contact details. */
  organisation?: { name?: string; legalName?: string | null }
  location: NewLocation
}

/**
 * Creates, in one transaction: the owner login (if new), the Organisation, its system roles, the first location (a
 * Garage), and the owner's Membership with the Owner role at all locations. Pass `tx` to join a transaction you already
 * have open (`tx`); otherwise one is opened.
 */
export async function createBusiness(input: CreateBusinessInput, tx?: Prisma.TransactionClient) {
  const run = async (tx: Prisma.TransactionClient) => {
    const user =
      "userId" in input.owner
        ? await tx.user.findUniqueOrThrow({ where: { id: input.owner.userId } })
        : await tx.user.create({ data: { ...input.owner.data, role: "GARAGE" } })

    const name = input.organisation?.name ?? input.location.name
    const organisation = await tx.organisation.create({
      data: {
        name,
        slug: await uniqueOrganisationSlug(tx, name),
        legalName: input.organisation?.legalName ?? null,
        vatNumber: input.location.vatNumber ?? null,
        contactEmail: input.location.email,
        contactPhone: input.location.phone,
      },
    })
    const { ownerRoleId } = await ensureSystemRoles(tx, organisation.id)
    const garage = await tx.garage.create({ data: { ...input.location, userId: user.id, organisationId: organisation.id } })
    const membership = await ensureOwnerMembership(tx, user.id, organisation.id, ownerRoleId)
    return { user, organisation, garage, membership }
  }

  return tx ? run(tx) : prisma.$transaction(run)
}
