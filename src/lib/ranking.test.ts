import { describe, expect, it } from "vitest"
import { bayesianRating, distanceScore, haversineKm, isRecommended, orderGarages, priceScores, rankScore, responseScore, type RankInput } from "./ranking"

const base: RankInput = { averageRating: 4.5, totalReviews: 20, isVerified: true, avgResponseMins: 30, completionRate: 0.95, distanceKm: 5, priceScore: 0.5 }

describe("signals", () => {
  it("pulls a rating with few reviews toward the prior", () => {
    expect(bayesianRating(5, 1)).toBeLessThan(bayesianRating(4.8, 100))
    expect(bayesianRating(0, 0)).toBe(4)
  })
  it("scores fast answers high and slow ones low", () => {
    expect(responseScore(30)).toBe(1)
    expect(responseScore(24 * 60)).toBe(0)
    expect(responseScore(null)).toBe(0.5)
  })
  it("scores near garages high and far ones low", () => {
    expect(distanceScore(0)).toBe(1)
    expect(distanceScore(80)).toBe(0)
    expect(distanceScore(null)).toBe(0.5)
  })
  it("measures London to Leicester at about 150 km", () => {
    const km = haversineKm({ lat: 51.5074, lng: -0.1278 }, { lat: 52.6369, lng: -1.1398 })
    expect(km).toBeGreaterThan(140)
    expect(km).toBeLessThan(160)
  })
})

describe("rankScore", () => {
  it("prefers a proven garage to a new one with a single perfect review", () => {
    const proven = rankScore({ ...base, averageRating: 4.8, totalReviews: 100 })
    const fluke = rankScore({ ...base, averageRating: 5, totalReviews: 1 })
    expect(proven).toBeGreaterThan(fluke)
  })
  it("prefers the closer, faster, cheaper garage when all else is equal", () => {
    expect(rankScore({ ...base, distanceKm: 1 })).toBeGreaterThan(rankScore({ ...base, distanceKm: 40 }))
    expect(rankScore({ ...base, avgResponseMins: 20 })).toBeGreaterThan(rankScore({ ...base, avgResponseMins: 600 }))
    expect(rankScore({ ...base, priceScore: 1 })).toBeGreaterThan(rankScore({ ...base, priceScore: 0 }))
  })
  it("stays between 0 and 1", () => {
    const best = rankScore({ averageRating: 5, totalReviews: 999, isVerified: true, avgResponseMins: 1, completionRate: 1, distanceKm: 0, priceScore: 1 })
    const worst = rankScore({ averageRating: 1, totalReviews: 999, isVerified: false, avgResponseMins: 9999, completionRate: 0, distanceKm: 999, priceScore: 0 })
    expect(best).toBeLessThanOrEqual(1)
    expect(worst).toBeGreaterThanOrEqual(0)
  })
})

describe("recommended", () => {
  it("needs both a strong score and enough reviews", () => {
    expect(isRecommended(0.9, 10)).toBe(true)
    expect(isRecommended(0.9, 1)).toBe(false)
    expect(isRecommended(0.5, 50)).toBe(false)
  })
})

describe("priceScores", () => {
  it("makes the cheapest 1 and the dearest 0, ignoring garages with no price", () => {
    const out = priceScores(new Map<string, number | null>([["a", 50], ["b", 100], ["c", null]]))
    expect(out.get("a")).toBe(1)
    expect(out.get("b")).toBe(0)
    expect(out.get("c")).toBeNull()
  })
  it("ties everyone when there is one price", () => {
    expect(priceScores(new Map<string, number | null>([["a", 70]])).get("a")).toBe(1)
  })
})

describe("orderGarages", () => {
  const mk = (id: string, score: number, featured = false) => ({ item: id, score, featured, totalReviews: 10 })
  it("puts featured garages first, then the rest by score", () => {
    const out = orderGarages([mk("a", 0.9), mk("b", 0.4, true), mk("c", 0.6)])
    expect(out.map((o) => o.item)).toEqual(["b", "a", "c"])
    expect(out[0].featured).toBe(true)
    expect(out[1].featured).toBe(false)
  })
  it("caps pinned garages so payment can't fill the page", () => {
    const out = orderGarages([mk("a", 0.9), mk("f1", 0.3, true), mk("f2", 0.2, true), mk("f3", 0.1, true), mk("f4", 0.05, true)], 3)
    expect(out.map((o) => o.item)).toEqual(["f1", "f2", "f3", "a", "f4"])
    expect(out.find((o) => o.item === "f4")?.featured).toBe(false)
  })
})
