import { NextResponse } from "next/server"
import type { Garage, Organisation } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { LEGACY_OWNER_PERMISSIONS, accessibleLocations, computeAccess, type Access, type AssignmentLike, type RoleLike } from "@/lib/org/access"
import { requestedLocationId } from "@/lib/org/active-location"

// Turns "this signed-in user" into "this business, this active location, these permissions". The ONE place that decides
// which garage a garage-portal request is about. Everything else (withGarage, the mixed owner/garage routes, the portal
// layout) calls it, so there is nowhere left for a hand-rolled `garage.findUnique({ where: { userId } })` to disagree.
//
// Two paths:
//   membership   the user belongs to a business (Membership + RoleAssignment): the normal path
//   legacy       a garage that has no business yet (organisationId null, before the backfill): its login is the owner

export interface LocationSummary {
  id: string
  name: string
  city: string
  status: string
  slug: string
}

export interface GarageAccess {
  userId: string
  /** The location the request is about. */
  garage: Garage
  /** The business; null only for a legacy garage that hasn't been backfilled yet. */
  organisation: Organisation | null
  membershipId: string | null
  access: Access
  /** What they hold, kept so services can work out what they may grant or change (see rules.ts). Empty on the legacy path. */
  assignments: AssignmentLike[]
  /** Every role of the business (needed to read the assignments). Empty on the legacy path. */
  roles: RoleLike[]
  /** Every location this user can open, for the switcher. */
  locations: LocationSummary[]
  legacy: boolean
}

export interface ResolveFailure {
  status: 403 | 404
  error: string
  code?: string
}

export type ResolveResult = { ok: true; value: GarageAccess } | { ok: false; failure: ResolveFailure }

const fail = (status: 403 | 404, error: string, code?: string): ResolveResult => ({ ok: false, failure: { status, error, code } })

export const garageFailureResponse = (f: ResolveFailure) => NextResponse.json(f.code ? { error: f.error, code: f.code } : { error: f.error }, { status: f.status })

const summary = (g: Garage): LocationSummary => ({ id: g.id, name: g.name, city: g.city, status: g.status, slug: g.slug })

/**
 * Picks the location to act on: the one asked for if the user may open it (archived ones included, to look at their
 * history), else the garage this login originally owned, else the first by creation date. By default an archived
 * location is passed over, so signing in never lands on a closed branch while a working one exists. Deterministic, so a
 * refresh never jumps location.
 */
export function pickActiveLocation(garages: readonly Garage[], userId: string, requested: string | null | undefined): Garage | null {
  if (garages.length === 0) return null
  const requestedGarage = requested ? garages.find((g) => g.id === requested) : undefined
  if (requestedGarage) return requestedGarage
  const working = garages.filter((g) => g.status !== "ARCHIVED")
  const pool = working.length > 0 ? working : garages
  return pool.find((g) => g.userId === userId) ?? [...pool].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))[0]
}

export async function resolveGarageAccess(userId: string, requested?: string | null): Promise<ResolveResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      suspendedAt: true,
      memberships: {
        orderBy: { createdAt: "asc" },
        select: { id: true, status: true, organisation: true, assignments: { select: { roleId: true, scopeKey: true } } },
      },
    },
  })
  // The token's role and suspension can be stale (it is baked in at sign-in), so the database decides every time.
  if (!user || user.role !== "GARAGE" || user.suspendedAt) return fail(403, "Forbidden")

  const active = user.memberships.filter((m) => m.status === "ACTIVE" && m.organisation.suspendedAt === null)
  if (active.length > 0) {
    let membership = active[0]
    if (requested && active.length > 1) {
      // More than one business: act in the one that owns the requested location.
      const target = await prisma.garage.findUnique({ where: { id: requested }, select: { organisationId: true } })
      membership = active.find((m) => m.organisation.id === target?.organisationId) ?? membership
    }
    return fromMembership(user.id, membership, requested)
  }
  // Belongs to a business, but every membership is switched off (suspended member or suspended business).
  if (user.memberships.length > 0) return fail(403, "Your access to this business is switched off", "NO_ACCESS")

  return fromLegacyGarage(user.id)
}

async function fromMembership(
  userId: string,
  membership: { id: string; organisation: Organisation; assignments: AssignmentLike[] },
  requested: string | null | undefined
): Promise<ResolveResult> {
  const { organisation, assignments } = membership
  const scope = accessibleLocations(assignments)

  const [roleRows, garages] = await Promise.all([
    prisma.role.findMany({ where: { organisationId: organisation.id }, select: { id: true, presetKey: true, isSystem: true, isEnabled: true, permissions: true } }),
    prisma.garage.findMany({ where: scope === "all" ? { organisationId: organisation.id } : { organisationId: organisation.id, id: { in: scope } } }),
  ])

  const garage = pickActiveLocation(garages, userId, requested)
  if (!garage) return fail(404, "Garage profile not found", "NO_GARAGE")

  const roles: RoleLike[] = roleRows
  return {
    ok: true,
    value: {
      userId,
      garage,
      organisation,
      membershipId: membership.id,
      access: computeAccess(assignments, roles, garage.id),
      assignments,
      roles,
      locations: garages.map(summary),
      legacy: false,
    },
  }
}

async function fromLegacyGarage(userId: string): Promise<ResolveResult> {
  const garage = await prisma.garage.findUnique({ where: { userId } })
  if (!garage) return fail(404, "Garage profile not found", "NO_GARAGE")
  // The garage belongs to a business, but this user holds no membership in it: they were removed (or the business is
  // suspended). Being the original login no longer counts for anything.
  if (garage.organisationId !== null) return fail(403, "You no longer have access to this garage", "NO_ACCESS")

  return {
    ok: true,
    value: {
      userId,
      garage,
      organisation: null,
      membershipId: null,
      access: { isOwner: true, locations: [garage.id], permissions: LEGACY_OWNER_PERMISSIONS },
      assignments: [],
      roles: [],
      locations: [summary(garage)],
      legacy: true,
    },
  }
}

/** For routes that serve customers, garages and admins from one handler: the garage side of the caller, for this request. */
export async function resolveActiveGarage(userId: string, req?: Request): Promise<ResolveResult> {
  return resolveGarageAccess(userId, await requestedLocationId(req))
}

/**
 * The caller's access to one SPECIFIC location (not the active one): for a thread, booking or quote that belongs to a
 * given garage. Null unless they may open exactly that location, so a member can never reach a location they don't hold.
 */
export async function accessToLocation(userId: string, garageId: string): Promise<GarageAccess | null> {
  const r = await resolveGarageAccess(userId, garageId)
  return r.ok && r.value.garage.id === garageId ? r.value : null
}
