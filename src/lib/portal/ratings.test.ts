import { describe, it, expect } from "vitest"
import { ratingAfterAdd, ratingAfterRemove } from "@/lib/portal/ratings"

describe("ratingAfterAdd", () => {
  it("folds a new rating into the running average", () => {
    const r = ratingAfterAdd({ averageRating: 4, totalReviews: 2 }, 5)
    expect(r.totalReviews).toBe(3)
    expect(r.averageRating).toBeCloseTo(4.333, 3)
  })

  it("starts from zero", () => {
    expect(ratingAfterAdd({ averageRating: 0, totalReviews: 0 }, 4)).toEqual({ averageRating: 4, totalReviews: 1 })
  })
})

describe("ratingAfterRemove", () => {
  it("is the exact inverse of adding", () => {
    const start = { averageRating: 4.6, totalReviews: 342 }
    const added = ratingAfterAdd(start, 2)
    const back = ratingAfterRemove(added, 2)
    expect(back.totalReviews).toBe(342)
    expect(back.averageRating).toBeCloseTo(4.6, 10)
  })

  it("resets to zero when the last review is removed", () => {
    expect(ratingAfterRemove({ averageRating: 5, totalReviews: 1 }, 5)).toEqual({ averageRating: 0, totalReviews: 0 })
    expect(ratingAfterRemove({ averageRating: 3, totalReviews: 0 }, 3)).toEqual({ averageRating: 0, totalReviews: 0 })
  })

  it("never leaves the 0–5 range, even with inconsistent counters", () => {
    const r = ratingAfterRemove({ averageRating: 1, totalReviews: 2 }, 5) // would be -3
    expect(r.averageRating).toBe(0)
    expect(ratingAfterRemove({ averageRating: 5, totalReviews: 2 }, 1).averageRating).toBe(5) // would be 9
  })
})
