import { describe, it, expect } from "vitest"
import { SERVICE_TYPES } from "@/lib/constants"
import { DEFAULT_SERVICE_DURATION, pricingRowSchema, pricingSchema, priceLabel } from "@/lib/portal/service-defaults"

describe("DEFAULT_SERVICE_DURATION", () => {
  it("has a sensible default for every service type", () => {
    for (const s of SERVICE_TYPES) {
      expect(DEFAULT_SERVICE_DURATION[s]).toBeGreaterThanOrEqual(15)
      expect(DEFAULT_SERVICE_DURATION[s]).toBeLessThanOrEqual(960)
    }
  })
})

describe("pricingRowSchema", () => {
  const row = (o: object = {}) => ({ serviceType: "MOT", priceFrom: 40, priceTo: 55, durationMins: 60, isActive: true, ...o })

  it("accepts a valid row, a single price and no price at all", () => {
    expect(pricingRowSchema.safeParse(row()).success).toBe(true)
    expect(pricingRowSchema.safeParse(row({ priceTo: null })).success).toBe(true)
    expect(pricingRowSchema.safeParse(row({ priceFrom: null, priceTo: null })).success).toBe(true)
  })

  it("rejects an up-to price below the from price, bad durations, negatives and unknown services", () => {
    expect(pricingRowSchema.safeParse(row({ priceFrom: 60, priceTo: 40 })).success).toBe(false)
    expect(pricingRowSchema.safeParse(row({ durationMins: 5 })).success).toBe(false)
    expect(pricingRowSchema.safeParse(row({ durationMins: 61.5 })).success).toBe(false)
    expect(pricingRowSchema.safeParse(row({ priceFrom: -1 })).success).toBe(false)
    expect(pricingRowSchema.safeParse(row({ serviceType: "TELEPORT" })).success).toBe(false)
  })

  it("requires at least one row", () => {
    expect(pricingSchema.safeParse({ prices: [] }).success).toBe(false)
    expect(pricingSchema.safeParse({ prices: [row()] }).success).toBe(true)
  })
})

describe("priceLabel", () => {
  it("formats single prices, ranges and 'from' prices", () => {
    expect(priceLabel(55, 55)).toBe("£55")
    expect(priceLabel(54.85, null)).toBe("from £54.85")
    expect(priceLabel(40, 55)).toBe("£40 – £55")
    expect(priceLabel(null, 60)).toBe("£60")
    expect(priceLabel(null, null)).toBeNull()
  })
})
