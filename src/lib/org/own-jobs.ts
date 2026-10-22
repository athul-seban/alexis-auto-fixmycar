import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { GarageContext } from "@/lib/garage-auth"

// "Own jobs only": a technician with a login sees and updates just the bookings assigned to them. Roles carry two tiers of
// key, e.g. bookings.view (everything at the location) and bookings.viewOwn (only my jobs); view implies viewOwn, so
// anyone who can see everything also passes an own-jobs check. A route decides which tier the caller is on with jobScope()
// and then filters with scopeWhere(). A technician login that hasn't been linked to a technician record sees nothing.

type Ctx = Pick<GarageContext, "userId" | "garage" | "can">

export type JobScope = { kind: "all" } | { kind: "own"; technicianId: string | null }

/** A technician id that matches nothing, so "own jobs of nobody" filters to an empty list rather than to everything. */
const NO_TECHNICIAN = "__no_technician__"

const TIERS = {
  bookings: { view: { all: "bookings.view", own: "bookings.viewOwn" }, update: { all: "bookings.manage", own: "bookings.updateOwn" } },
  diary: { view: { all: "diary.view", own: "diary.viewOwn" } },
} as const

/** The technician this login is linked to at this location, if still active. */
export async function linkedTechnicianId(userId: string, garageId: string): Promise<string | null> {
  const tech = await prisma.technician.findFirst({ where: { userId, garageId, isActive: true }, select: { id: true } })
  return tech?.id ?? null
}

/**
 * What part of the location's jobs this caller may reach: all of them, only their own, or (null) none.
 * `mode` "update" is for writes; the diary has no update tier.
 */
export async function jobScope(ctx: Ctx, area: "bookings", mode?: "view" | "update"): Promise<JobScope | null>
export async function jobScope(ctx: Ctx, area: "diary"): Promise<JobScope | null>
export async function jobScope(ctx: Ctx, area: "bookings" | "diary", mode: "view" | "update" = "view"): Promise<JobScope | null> {
  const tier = area === "diary" ? TIERS.diary.view : TIERS.bookings[mode]
  if (ctx.can(tier.all)) return { kind: "all" }
  if (!ctx.can(tier.own)) return null
  return { kind: "own", technicianId: await linkedTechnicianId(ctx.userId, ctx.garage.id) }
}

/** The booking filter for a scope (AND it with the location filter). No scope at all (no booking access) matches nothing. */
export function scopeWhere(scope: JobScope | null): Prisma.BookingWhereInput {
  if (scope === null) return { id: NO_TECHNICIAN }
  return scope.kind === "all" ? {} : { technicianId: scope.technicianId ?? NO_TECHNICIAN }
}

/** May this scope touch a booking assigned to `technicianId`? */
export function scopeAllows(scope: JobScope, technicianId: string | null): boolean {
  return scope.kind === "all" || (scope.technicianId !== null && scope.technicianId === technicianId)
}

/**
 * What a technician may change on their own job: record that it has started, finished or was a no-show, and add notes.
 * Everything else (moving it, reassigning it, cancelling, prices, contacting the customer) is the manager's call.
 */
export const OWN_JOB_STATUSES = ["IN_PROGRESS", "COMPLETED", "NO_SHOW"] as const
export const OWN_JOB_FIELDS = ["status", "notes"] as const

/** The fields in a booking update that an own-jobs caller isn't allowed to set. Empty means the update is fine. */
export function disallowedOwnJobFields(body: Record<string, unknown>): string[] {
  const bad = Object.keys(body).filter((k) => !(OWN_JOB_FIELDS as readonly string[]).includes(k))
  if (typeof body.status === "string" && !(OWN_JOB_STATUSES as readonly string[]).includes(body.status)) bad.push(`status:${body.status}`)
  return bad
}
