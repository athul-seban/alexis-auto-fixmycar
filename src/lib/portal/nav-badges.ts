import type { Garage } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { countNewEnquiries } from "@/lib/portal/enquiries"

/** "Needs attention" counts shown next to sidebar items. Keys match `badge` in portal-shell/nav.ts. */
export type NavBadges = Record<string, number>

const DAY_MS = 86_400_000

/** Bookings whose slot has passed without an outcome, unreplied reviews, and enquiries awaiting a first response. */
export async function garageNavBadges(garage: Garage, now = new Date()): Promise<NavBadges> {
  const [needsOutcome, unrepliedReviews, newEnquiries] = await Promise.all([
    prisma.booking.count({
      where: { garageId: garage.id, status: { in: ["PENDING", "CONFIRMED"] }, timeConfirmed: true, scheduledAt: { lt: now } },
    }),
    prisma.review.count({ where: { garageId: garage.id, reply: null } }),
    countNewEnquiries(garage),
  ])
  return { needsOutcome, unrepliedReviews, newEnquiries }
}

/** Garages waiting for an approval decision. */
export async function adminNavBadges(): Promise<NavBadges> {
  return { pendingGarages: await prisma.garage.count({ where: { status: "PENDING" } }) }
}

/** Quotes a garage has answered and the customer hasn't acted on, and vehicles with a MOT/service due within 30 days. */
export async function ownerNavBadges(userId: string, now = new Date()): Promise<NavBadges> {
  const soon = new Date(now.getTime() + 30 * DAY_MS)
  const [quotesToReview, vehiclesDue] = await Promise.all([
    prisma.quote.count({ where: { ownerId: userId, status: "SENT" } }),
    prisma.vehicle.count({
      where: { ownerId: userId, OR: [{ motDueDate: { lte: soon } }, { serviceDueDate: { lte: soon } }] },
    }),
  ])
  return { quotesToReview, vehiclesDue }
}
