import { describe, expect, it } from "vitest"
import { percentile, summarisePrices } from "./price-guidance"

describe("percentile", () => {
  it("interpolates between neighbours", () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25)
    expect(percentile([10, 20, 30, 40], 0)).toBe(10)
    expect(percentile([10, 20, 30, 40], 1)).toBe(40)
  })
})

describe("summarisePrices", () => {
  it("returns the middle half and median, rounded to £5", () => {
    expect(summarisePrices([40, 45, 50, 55, 60, 65, 70])).toEqual({ low: 50, median: 55, high: 65, samples: 7 })
  })
  it("returns null when there are too few samples", () => {
    expect(summarisePrices([40, 50, 60, 70])).toBeNull()
  })
  it("ignores zero, negative and non-finite prices", () => {
    expect(summarisePrices([0, -5, NaN, 40, 45, 50, 55])).toBeNull()
    expect(summarisePrices([0, 40, 45, 50, 55, 60])?.samples).toBe(5)
  })
  it("isn't dragged around by one outlier", () => {
    const g = summarisePrices([50, 52, 55, 58, 60, 5000])!
    expect(g.high).toBeLessThan(100)
  })
})
