import type { Garage } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { countNewEnquiries } from "@/lib/portal/enquiries"
import { garageUnreadCount, ownerUnreadCount } from "@/lib/messaging"
import { jobScope, scopeWhere, type JobScope } from "@/lib/org/own-jobs"
import type { PermissionKey } from "@/lib/org/permissions"

/** "Needs attention" counts shown next to sidebar items. Keys match `badge` in portal-shell/nav.ts. */
export type NavBadges = Record<string, number>

const DAY_MS = 86_400_000

/** Who is looking: counts only cover what they may open (a technician's "needs outcome" is their own jobs, not the garage's). */
export interface BadgeViewer {
  userId: string
  can: (key: PermissionKey) => boolean
}

/**
 * Bookings whose slot has passed without an outcome, unreplied reviews, and enquiries awaiting a first response. With a
 * `viewer`, each count is limited to what that person's role may see; without one it is the whole location.
 */
export async function garageNavBadges(garage: Garage, viewer?: BadgeViewer, now = new Date()): Promise<NavBadges> {
  const allowed = (key: PermissionKey) => !viewer || viewer.can(key)
  const scope: JobScope | null = viewer ? await jobScope({ userId: viewer.userId, garage, can: viewer.can }, "bookings") : { kind: "all" }

  const [needsOutcome, unrepliedReviews, newEnquiries, unreadMessages] = await Promise.all([
    scope
      ? prisma.booking.count({
          where: { AND: [{ garageId: garage.id, status: { in: ["PENDING", "CONFIRMED"] }, timeConfirmed: true, scheduledAt: { lt: now } }, scopeWhere(scope)] },
        })
      : 0,
    allowed("reviews.view") ? prisma.review.count({ where: { garageId: garage.id, reply: null } }) : 0,
    allowed("enquiries.view") ? countNewEnquiries(garage) : 0,
    allowed("messages.view") ? garageUnreadCount(garage) : 0,
  ])
  return { needsOutcome, unrepliedReviews, newEnquiries, unreadMessages }
}

/** Garages, documents, reviews and business websites waiting for an admin's decision. */
export async function adminNavBadges(): Promise<NavBadges> {
  const [pendingGarages, pendingDocuments, openDisputes, pendingSites] = await Promise.all([
    prisma.garage.count({ where: { status: "PENDING" } }),
    prisma.garageDocument.count({ where: { status: "PENDING" } }),
    prisma.review.count({ where: { disputeStatus: "OPEN" } }),
    prisma.organisationSite.count({ where: { status: "PENDING_REVIEW" } }),
  ])
  return { pendingGarages, pendingDocuments, openDisputes, pendingSites }
}

/** Quotes a garage has answered and the customer hasn't acted on, and vehicles with a MOT/service due within 30 days. */
export async function ownerNavBadges(userId: string, now = new Date()): Promise<NavBadges> {
  const soon = new Date(now.getTime() + 30 * DAY_MS)
  const [quotesToReview, vehiclesDue, unreadMessages] = await Promise.all([
    prisma.quote.count({ where: { ownerId: userId, status: "SENT" } }),
    prisma.vehicle.count({
      where: { ownerId: userId, OR: [{ motDueDate: { lte: soon } }, { serviceDueDate: { lte: soon } }] },
    }),
    ownerUnreadCount(userId),
  ])
  return { quotesToReview, vehiclesDue, unreadMessages }
}
