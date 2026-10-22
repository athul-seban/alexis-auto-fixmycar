import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { SERVICE_TYPES } from "@/lib/constants"
import { formatPhone, isValidUkPhone } from "@/lib/portal/phone"
import { slugify } from "@/lib/utils"
import type { GarageContext } from "@/lib/garage-auth"
import { ALL_LOCATIONS } from "@/lib/org/access"
import { OrgError } from "@/lib/org/org-error"

// The locations (branches) of a garage business: list them, add one, close one and bring it back. A new location starts
// PENDING like any garage and goes live only when the platform approves it. A location is never deleted: closing one
// ARCHIVES it, which keeps its bookings, customers and invoices intact. Editing a location's profile is the existing
// /api/garages/[id] route, which checks profile.edit at that location.

type Ctx = Pick<GarageContext, "organisation" | "actor">

/** A business can't grow without bound; this is generous for any real chain. Archived locations don't count. */
export const MAX_LOCATIONS = 50

/** Bookings that still need the location: moving or cancelling them has to come before closing it. */
const OPEN_BOOKING_STATUSES = ["PENDING", "CONFIRMED", "IN_PROGRESS"]

function business(ctx: Ctx) {
  if (!ctx.organisation) throw new OrgError("CONFLICT", "This garage hasn't been set up as a business yet. Ask support to run the upgrade.")
  return ctx.organisation
}

// ---- input ---------------------------------------------------------------------------------------------------------

export const newLocationSchema = z.object({
  name: z.string().trim().min(2, "Enter the location's name").max(100),
  phone: z.string().trim().refine(isValidUkPhone, "Enter a valid UK phone number, e.g. 020 7123 4567"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
  address: z.string().trim().min(5, "Enter the street address").max(200),
  city: z.string().trim().min(2, "Enter the town or city").max(80),
  postcode: z.string().trim().min(5, "Enter a valid postcode").max(10),
  description: z.string().trim().max(2000).optional(),
  isMobile: z.boolean().default(false),
  services: z.array(z.enum(SERVICE_TYPES)).min(1, "Choose at least one service").max(SERVICE_TYPES.length),
})
export type NewLocationInput = z.infer<typeof newLocationSchema>

export const locationActionSchema = z.object({ action: z.enum(["archive", "restore"]) })

// ---- reading -------------------------------------------------------------------------------------------------------

export interface LocationRow {
  id: string
  name: string
  slug: string
  city: string
  postcode: string
  status: string
  isVerified: boolean
  createdAt: Date
  /** The business's original location (the oldest). */
  isPrimary: boolean
  upcomingBookings: number
  staffCount: number
}

/** Every location of the business with the numbers a manager needs before closing one. */
export async function listLocations(ctx: Ctx, now: Date = new Date()): Promise<{ locations: LocationRow[]; limit: number }> {
  const org = business(ctx)
  const locations = await prisma.garage.findMany({
    where: { organisationId: org.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, slug: true, city: true, postcode: true, status: true, isVerified: true, createdAt: true },
  })
  const ids = locations.map((l) => l.id)

  const [open, members] = await Promise.all([
    prisma.booking.groupBy({ by: ["garageId"], where: { garageId: { in: ids }, status: { in: OPEN_BOOKING_STATUSES }, scheduledAt: { gte: now } }, _count: { _all: true } }),
    prisma.membership.findMany({ where: { organisationId: org.id, status: "ACTIVE" }, select: { assignments: { select: { scopeKey: true } } } }),
  ])
  const upcoming = new Map(open.map((o) => [o.garageId, o._count._all]))

  return {
    limit: MAX_LOCATIONS,
    locations: locations.map((l, i) => ({
      ...l,
      isPrimary: i === 0,
      upcomingBookings: upcoming.get(l.id) ?? 0,
      // People who can open this location: those holding a role here or everywhere.
      staffCount: members.filter((m) => m.assignments.some((a) => a.scopeKey === l.id || a.scopeKey === ALL_LOCATIONS)).length,
    })),
  }
}

// ---- adding --------------------------------------------------------------------------------------------------------

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name).slice(0, 60) || "garage"
  let slug = base
  for (let n = 1; await prisma.garage.findUnique({ where: { slug }, select: { id: true } }); n++) slug = `${base}-${n}`
  return slug
}

/**
 * Adds a location to the business. It starts PENDING (not on the marketplace) until a platform admin approves it with
 * the same readiness check as any garage. Everyone holding a role at "all locations" can open it straight away; people
 * assigned to specific locations are given access to it separately.
 */
export async function addLocation(ctx: Ctx, input: NewLocationInput) {
  const org = business(ctx)

  const existing = await prisma.garage.findMany({ where: { organisationId: org.id, status: { not: "ARCHIVED" } }, select: { name: true, postcode: true } })
  if (existing.length >= MAX_LOCATIONS) throw new OrgError("LIMIT", `A business can have up to ${MAX_LOCATIONS} locations.`, { limit: MAX_LOCATIONS })
  const postcode = input.postcode.toUpperCase()
  if (existing.some((l) => l.name.toLowerCase() === input.name.toLowerCase() && l.postcode.toUpperCase() === postcode)) {
    throw new OrgError("CONFLICT", "You already have a location with that name and postcode.")
  }

  // Two people adding at once could pick the same slug: retry with the next free one rather than failing.
  let created
  for (let attempt = 0; ; attempt++) {
    try {
      created = await prisma.garage.create({
        data: {
          organisationId: org.id,
          userId: null,
          name: input.name,
          slug: await uniqueSlug(input.name),
          description: input.description || null,
          phone: formatPhone(input.phone),
          email: input.email,
          vatNumber: org.vatNumber,
          address: input.address,
          city: input.city,
          postcode,
          isMobile: input.isMobile,
          services: JSON.stringify(input.services),
          status: "PENDING",
        },
      })
      break
    } catch (err) {
      if ((err as { code?: string })?.code === "P2002" && attempt < 3) continue
      throw err
    }
  }

  await audit({ user: ctx.actor }, { action: "LOCATION_ADDED", targetType: "LOCATION", targetId: created.id, organisationId: org.id, detail: `${created.name}, ${created.city}` })
  return created
}

// ---- closing and reopening -----------------------------------------------------------------------------------------

/**
 * Archives a location (a branch that has closed) or brings it back.
 *  - Archive: not while it is the business's only working location, not while it has upcoming bookings, and not if the
 *    platform has suspended it (that is the platform's decision to lift, not the business's to hide behind).
 *  - Restore: goes back to live if it had been approved before, otherwise back to waiting for approval. It is never
 *    restored into a state the platform hasn't allowed.
 */
export async function setLocationArchived(ctx: Ctx, locationId: string, action: "archive" | "restore", now: Date = new Date()) {
  const org = business(ctx)
  // This business's locations only: another business's id is "not found", never "forbidden".
  const location = await prisma.garage.findFirst({ where: { id: locationId, organisationId: org.id } })
  if (!location) throw new OrgError("NOT_FOUND", "That location isn't part of your business.")

  if (action === "archive") {
    if (location.status === "ARCHIVED") return location
    if (location.status === "SUSPENDED") throw new OrgError("CONFLICT", "This location has been suspended by Quote My Garage. Contact support to resolve it.")

    const others = await prisma.garage.count({ where: { organisationId: org.id, id: { not: location.id }, status: { not: "ARCHIVED" } } })
    if (others === 0) throw new OrgError("CONFLICT", "Your business needs at least one active location.")

    const upcomingBookings = await prisma.booking.count({ where: { garageId: location.id, status: { in: OPEN_BOOKING_STATUSES }, scheduledAt: { gte: now } } })
    if (upcomingBookings > 0) {
      throw new OrgError("IN_USE", `This location has ${upcomingBookings} upcoming booking${upcomingBookings === 1 ? "" : "s"}. Move or cancel ${upcomingBookings === 1 ? "it" : "them"} first.`, { upcomingBookings })
    }

    const updated = await prisma.garage.update({ where: { id: location.id }, data: { status: "ARCHIVED" } })
    await audit({ user: ctx.actor }, { action: "LOCATION_ARCHIVED", targetType: "LOCATION", targetId: location.id, organisationId: org.id, detail: `${location.name}, ${location.city}` })
    return updated
  }

  if (location.status !== "ARCHIVED") return location
  const live = await prisma.garage.count({ where: { organisationId: org.id, status: { not: "ARCHIVED" } } })
  if (live >= MAX_LOCATIONS) throw new OrgError("LIMIT", `A business can have up to ${MAX_LOCATIONS} locations.`, { limit: MAX_LOCATIONS })

  const updated = await prisma.garage.update({ where: { id: location.id }, data: { status: location.isVerified ? "APPROVED" : "PENDING" } })
  await audit({ user: ctx.actor }, { action: "LOCATION_RESTORED", targetType: "LOCATION", targetId: location.id, organisationId: org.id, detail: `${location.name}, ${location.city}` })
  return updated
}
