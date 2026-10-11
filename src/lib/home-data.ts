import { prisma } from "@/lib/prisma"
import { parseServiceList } from "@/lib/garage-mapper"
import { bayesianRating } from "@/lib/ranking"
import { isFeatured } from "@/lib/portal/plans"
import { getServiceLabel } from "@/lib/utils"

// Everything the home page shows about the marketplace comes from the database, never from hard-coded marketing
// numbers. Each function degrades to "nothing to show" if the database is unreachable, and the sections that use
// them hide themselves when there isn't enough real data to be honest about.

export interface HomeStats {
  garages: number
  reviews: number
  /** Average over all reviews, or null with no reviews. */
  averageRating: number | null
  completedJobs: number
}

export async function getHomeStats(): Promise<HomeStats> {
  try {
    const [garages, review, completedJobs] = await Promise.all([
      prisma.garage.count({ where: { status: "APPROVED" } }),
      prisma.review.aggregate({ _count: { _all: true }, _avg: { rating: true } }),
      prisma.booking.count({ where: { status: "COMPLETED" } }),
    ])
    return {
      garages,
      reviews: review._count._all,
      averageRating: review._count._all > 0 && review._avg.rating !== null ? Math.round(review._avg.rating * 10) / 10 : null,
      completedJobs,
    }
  } catch (err) {
    console.error("[home] stats unavailable:", err)
    return { garages: 0, reviews: 0, averageRating: null, completedJobs: 0 }
  }
}

export interface FeaturedGarage {
  id: string
  slug: string
  name: string
  city: string
  postcode: string
  description: string | null
  isVerified: boolean
  isMobile: boolean
  featured: boolean
  rating: number
  reviews: number
  /** Typical time to answer a request, e.g. "< 2 hours"; null when we have no measurement. */
  responseTime: string | null
  services: string[]
}

export function responseLabel(mins: number | null): string | null {
  if (mins === null || mins <= 0) return null
  if (mins < 60) return "< 1 hour"
  if (mins < 24 * 60) return `< ${Math.ceil(mins / 60)} hours`
  return "< 2 days"
}

/** Approved garages, best first: paid featured placements (at most 2, labelled) then by a review-confidence score. */
export async function getFeaturedGarages(limit = 4): Promise<FeaturedGarage[]> {
  try {
    const rows = await prisma.garage.findMany({
      where: { status: "APPROVED" },
      take: 60,
      orderBy: [{ totalReviews: "desc" }, { createdAt: "asc" }],
      select: {
        id: true, slug: true, name: true, city: true, postcode: true, description: true, isVerified: true, isMobile: true,
        services: true, averageRating: true, totalReviews: true, avgResponseMins: true, featuredUntil: true,
      },
    })
    const now = new Date()
    const scored = rows
      .map((g) => ({ g, featured: isFeatured(g, now), score: bayesianRating(g.averageRating, g.totalReviews) + (g.isVerified ? 0.2 : 0) }))
      .sort((a, b) => b.score - a.score)
    // Payment can pin a couple of places, never the whole row.
    const pinned = scored.filter((s) => s.featured).slice(0, 2)
    const rest = scored.filter((s) => !pinned.includes(s))
    return [...pinned, ...rest].slice(0, limit).map(({ g, featured }) => ({
      id: g.id,
      slug: g.slug,
      name: g.name,
      city: g.city,
      postcode: g.postcode,
      description: g.description,
      isVerified: g.isVerified,
      isMobile: g.isMobile,
      featured,
      rating: Math.round(g.averageRating * 10) / 10,
      reviews: g.totalReviews,
      responseTime: responseLabel(g.avgResponseMins),
      services: parseServiceList(g.services).slice(0, 3).map((s) => getServiceLabel(s)),
    }))
  } catch (err) {
    console.error("[home] featured garages unavailable:", err)
    return []
  }
}

export interface HomeReview {
  id: string
  rating: number
  comment: string
  /** "Sarah M." — first name and last initial only. */
  author: string
  garageName: string
  garageSlug: string
  service: string
  createdAt: Date
}

/** "Sarah Mitchell" → "Sarah M."; a single name stays as is; nothing → "A customer". */
export function displayName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "A customer"
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`
}

/** Recent genuine reviews worth quoting: 4★+, a real comment, and not removed after a dispute. */
export async function getHomeReviews(limit = 6): Promise<HomeReview[]> {
  try {
    const rows = await prisma.review.findMany({
      where: { rating: { gte: 4 }, NOT: { disputeStatus: "UPHELD" } },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true, rating: true, comment: true, createdAt: true, customerName: true,
        owner: { select: { name: true } },
        garage: { select: { name: true, slug: true, status: true } },
        booking: { select: { serviceType: true } },
      },
    })
    return rows
      .filter((r) => r.garage.status === "APPROVED" && r.comment.trim().length >= 20)
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment.trim(),
        author: displayName(r.owner?.name ?? r.customerName),
        garageName: r.garage.name,
        garageSlug: r.garage.slug,
        service: getServiceLabel(r.booking.serviceType),
        createdAt: r.createdAt,
      }))
  } catch (err) {
    console.error("[home] reviews unavailable:", err)
    return []
  }
}
