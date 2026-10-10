import type { Garage } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { countNewEnquiries } from "@/lib/portal/enquiries"
import { garageUnreadCount, ownerUnreadCount } from "@/lib/messaging"

/** "Needs attention" counts shown next to sidebar items. Keys match `badge` in portal-shell/nav.ts. */
export type NavBadges = Record<string, number>

const DAY_MS = 86_400_000

/** Bookings whose slot has passed without an outcome, unreplied reviews, and enquiries awaiting a first response. */
export async function garageNavBadges(garage: Garage, now = new Date()): Promise<NavBadges> {
  const [needsOutcome, unrepliedReviews, newEnquiries, unreadMessages] = await Promise.all([
    prisma.booking.count({
      where: { garageId: garage.id, status: { in: ["PENDING", "CONFIRMED"] }, timeConfirmed: true, scheduledAt: { lt: now } },
    }),
    prisma.review.count({ where: { garageId: garage.id, reply: null } }),
    countNewEnquiries(garage),
    garageUnreadCount(garage),
  ])
  return { needsOutcome, unrepliedReviews, newEnquiries, unreadMessages }
}

/** Garages waiting for an approval decision. */
export async function adminNavBadges(): Promise<NavBadges> {
  const [pendingGarages, pendingDocuments, openDisputes] = await Promise.all([
    prisma.garage.count({ where: { status: "PENDING" } }),
    prisma.garageDocument.count({ where: { status: "PENDING" } }),
    prisma.review.count({ where: { disputeStatus: "OPEN" } }),
  ])
  return { pendingGarages, pendingDocuments, openDisputes }
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
