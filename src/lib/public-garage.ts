import { prisma } from "@/lib/prisma"
import { displayName } from "@/lib/display-name"
import { parseOpeningHours, parseServiceList, toGarageProfile } from "@/lib/garage-mapper"
import { parsePortalSettings } from "@/lib/portal/portal-settings"
import type { GarageProfile, PublicServicePrice, Review } from "@/types"

/** Online booking is offered when the garage has the widget switched on and has set its opening hours. */
export function canBookOnline(garage: { portalSettings: string | null; openingHours: string | null }): boolean {
  return parsePortalSettings(garage.portalSettings).widget.enabled && parseOpeningHours(garage.openingHours) !== null
}

export type PublicGarage = GarageProfile & {
  reviews: Review[]
  ratingBreakdown: { stars: number; pct: number }[]
  completedJobs: number
  verificationBadges: string[]
  prices: PublicServicePrice[]
  /** How a request to this garage is answered: its reply time, and the works it prices instantly. */
  quoteTerms: { responseHours: number; instantPrices: Record<string, number> }
  /** The booking widget is switched on, so the profile can offer "Book online". Raw portal settings never leave the server. */
  bookOnline: boolean
}

/**
 * Everything the public garage profile shows, as plain serialisable data: used by the server-rendered page (so the
 * description, prices and reviews are in the first HTML) and by `GET /api/garages/[id]`. Null for an unknown or
 * unapproved garage.
 */
export async function getPublicGarage(idOrSlug: string): Promise<PublicGarage | null> {
  const garage = await prisma.garage.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], status: "APPROVED" },
    include: {
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { owner: { select: { name: true } } },
      },
    },
  })
  if (!garage) return null

  const [counts, completedJobs, priceRows] = await Promise.all([
    prisma.review.groupBy({ by: ["rating"], where: { garageId: garage.id }, _count: { _all: true } }),
    // Finished jobs only: totalBookings also counts pending and cancelled ones.
    prisma.booking.count({ where: { garageId: garage.id, status: "COMPLETED" } }),
    prisma.servicePrice.findMany({ where: { garageId: garage.id, isActive: true } }),
  ])

  const reviews: Review[] = garage.reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    title: r.title,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
    reply: r.reply,
    repliedAt: r.repliedAt?.toISOString() ?? null,
    // Reviews left through a manage link have no account, only a name snapshot; never expose a full name.
    author: displayName(r.owner?.name ?? r.customerName),
  }))

  const totalRated = counts.reduce((sum, c) => sum + c._count._all, 0)
  const ratingBreakdown = [5, 4, 3, 2, 1].map((stars) => {
    const count = counts.find((c) => c.rating === stars)?._count._all ?? 0
    return { stars, pct: totalRated ? Math.round((count / totalRated) * 100) : 0 }
  })

  // Published prices: only services the garage still offers and hasn't switched off.
  const offered = new Set<string>(parseServiceList(garage.services))
  const prices = priceRows
    .filter((p) => offered.has(p.serviceType) && (p.priceFrom !== null || p.priceTo !== null))
    .map((p) => ({ serviceType: p.serviceType, priceFrom: p.priceFrom, priceTo: p.priceTo, durationMins: p.durationMins, notes: p.notes }))

  const instantPrices: Record<string, number> = {}
  for (const p of priceRows) {
    if (offered.has(p.serviceType) && p.autoQuote && p.fixedPrice != null && p.fixedPrice > 0) instantPrices[p.serviceType] = p.fixedPrice
  }

  return {
    ...toGarageProfile(garage),
    verificationBadges: parseServiceList(garage.verificationBadges),
    reviews,
    ratingBreakdown,
    completedJobs,
    prices,
    quoteTerms: { responseHours: parsePortalSettings(garage.portalSettings).quotes.responseHours, instantPrices },
    bookOnline: canBookOnline(garage),
  } as PublicGarage
}
