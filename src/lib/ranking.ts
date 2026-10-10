// Best-match ranking for garage search. Pure, so the weights are easy to tune and test.
//
// Each signal is scaled to 0..1 (1 = best). A missing signal scores a neutral 0.5 rather than 0, so a brand-new garage
// isn't buried for lacking history, but also can't beat one with a proven record on the strength of nothing.

export interface RankInput {
  averageRating: number
  totalReviews: number
  isVerified: boolean
  /** Running average minutes between a job request arriving and this garage answering. */
  avgResponseMins: number | null
  /** Share of this garage's finished bookings that were completed (not cancelled / no-show), 0..1. */
  completionRate: number | null
  /** Distance from the customer in km, when their location is known. */
  distanceKm: number | null
  /** 0..1, 1 = cheapest of the garages being compared for the requested service. */
  priceScore: number | null
}

export const WEIGHTS = {
  rating: 0.35,
  response: 0.2,
  completion: 0.15,
  distance: 0.15,
  price: 0.1,
  verified: 0.05,
} as const

const NEUTRAL = 0.5
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Pull a rating with few reviews toward the platform average so one 5-star review doesn't outrank 100 at 4.8. */
export function bayesianRating(avg: number, count: number, prior = 4, priorWeight = 5): number {
  if (count <= 0) return prior
  return (avg * count + prior * priorWeight) / (count + priorWeight)
}

/** 1 for an answer within the hour, falling to 0 at a day. */
export function responseScore(mins: number | null): number {
  if (mins === null) return NEUTRAL
  return clamp01(1 - (mins - 60) / (24 * 60 - 60))
}

/** 1 right next door, 0 at 50 km or more. */
export function distanceScore(km: number | null): number {
  if (km === null) return NEUTRAL
  return clamp01(1 - km / 50)
}

export function rankScore(g: RankInput): number {
  const rating = clamp01((bayesianRating(g.averageRating, g.totalReviews) - 1) / 4)
  return (
    WEIGHTS.rating * rating +
    WEIGHTS.response * responseScore(g.avgResponseMins) +
    WEIGHTS.completion * (g.completionRate ?? NEUTRAL) +
    WEIGHTS.distance * distanceScore(g.distanceKm) +
    WEIGHTS.price * (g.priceScore ?? NEUTRAL) +
    WEIGHTS.verified * (g.isVerified ? 1 : 0)
  )
}

/** A "Recommended" badge needs a strong score AND enough reviews to mean something. */
export const RECOMMEND_MIN_SCORE = 0.72
export const RECOMMEND_MIN_REVIEWS = 3

export const isRecommended = (score: number, totalReviews: number) => score >= RECOMMEND_MIN_SCORE && totalReviews >= RECOMMEND_MIN_REVIEWS

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

/** Scale prices to 0..1 where the cheapest is 1. Garages without a price get null (neutral). With one price, everyone ties. */
export function priceScores(prices: Map<string, number | null>): Map<string, number | null> {
  const known = [...prices.values()].filter((p): p is number => p !== null && p > 0)
  const min = Math.min(...known)
  const max = Math.max(...known)
  const out = new Map<string, number | null>()
  for (const [id, p] of prices) out.set(id, p === null || p <= 0 ? null : max === min ? 1 : clamp01((max - p) / (max - min)))
  return out
}

export interface Ranked<T> {
  item: T
  score: number
  featured: boolean
  recommended: boolean
}

/**
 * Order garages: featured ones first (at most `maxFeatured`, best-scoring first), then everyone else by score.
 * A featured garage past the cap simply competes organically, so paying can't push out every other result.
 */
export function orderGarages<T>(
  items: { item: T; score: number; featured: boolean; totalReviews: number }[],
  maxFeatured = 3
): Ranked<T>[] {
  const byScore = [...items].sort((a, b) => b.score - a.score)
  const pinned = byScore.filter((i) => i.featured).slice(0, maxFeatured)
  const rest = byScore.filter((i) => !pinned.includes(i))
  return [...pinned, ...rest].map((i) => ({
    item: i.item,
    score: i.score,
    featured: pinned.includes(i),
    recommended: isRecommended(i.score, i.totalReviews),
  }))
}
