import { describe, expect, it } from "vitest"
import { garageReadiness, type ReadinessInput } from "@/lib/portal/readiness"

const hours = (open: boolean) =>
  JSON.stringify(Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, { open, from: "09:00", to: "17:00" }])))

const complete: ReadinessInput = {
  description: "A friendly independent garage serving the local area for twenty years.",
  logo: "https://example.com/logo.png",
  images: "[]",
  phone: "01234 567890",
  email: "hello@example.com",
  address: "1 High Street",
  postcode: "AB1 2CD",
  services: JSON.stringify(["MOT", "FULL_SERVICE"]),
  openingHours: hours(true),
  priceCount: 2,
}

describe("garageReadiness", () => {
  it("passes a complete profile", () => {
    const r = garageReadiness(complete)
    expect(r.ready).toBe(true)
    expect(r.missingRequired).toEqual([])
    expect(r.checks.every((c) => c.ok)).toBe(true)
  })

  it("flags each missing required item by label", () => {
    const r = garageReadiness({ ...complete, description: "Too short", services: "[]", openingHours: null })
    expect(r.ready).toBe(false)
    expect(r.missingRequired).toHaveLength(3)
    expect(r.missingRequired.join(" ")).toMatch(/Description/)
    expect(r.missingRequired).toContain("At least one service")
    expect(r.missingRequired).toContain("Opening hours")
  })

  it("treats a week of closed days as no opening hours", () => {
    expect(garageReadiness({ ...complete, openingHours: hours(false) }).missingRequired).toContain("Opening hours")
  })

  it("keeps photos and pricing advisory", () => {
    const r = garageReadiness({ ...complete, logo: null, images: "[]", priceCount: 0 })
    expect(r.ready).toBe(true)
    expect(r.checks.filter((c) => !c.ok).map((c) => c.key)).toEqual(["photos", "pricing"])
  })
})
