import { describe, it, expect } from "vitest"
import { orgFeatureEnabled } from "@/lib/org/features"

describe("orgFeatureEnabled", () => {
  it("is off in production unless ORG_FEATURES names the feature", () => {
    expect(orgFeatureEnabled("staff", "o1", { NODE_ENV: "production" })).toBe(false)
    expect(orgFeatureEnabled("staff", "o1", { NODE_ENV: "production", ORG_FEATURES: "" })).toBe(false)
    expect(orgFeatureEnabled("staff", "o1", { NODE_ENV: "production", ORG_FEATURES: "staff" })).toBe(true)
    expect(orgFeatureEnabled("locations", "o1", { NODE_ENV: "production", ORG_FEATURES: "staff" })).toBe(false)
    expect(orgFeatureEnabled("sites", "o1", { NODE_ENV: "production", ORG_FEATURES: "staff, locations ,sites" })).toBe(true)
  })

  it("'all' switches everything on", () => {
    for (const f of ["staff", "locations", "sites"] as const) expect(orgFeatureEnabled(f, "o1", { NODE_ENV: "production", ORG_FEATURES: "all" })).toBe(true)
  })

  it("is on outside production by default, so screens can be built and tested", () => {
    expect(orgFeatureEnabled("staff", "o1", { NODE_ENV: "development" })).toBe(true)
    expect(orgFeatureEnabled("sites", null, { NODE_ENV: "test" })).toBe(true)
  })

  it("but an explicit ORG_FEATURES still wins outside production", () => {
    expect(orgFeatureEnabled("sites", "o1", { NODE_ENV: "development", ORG_FEATURES: "staff" })).toBe(false)
  })

  it("ORG_BETA_IDS limits it to the listed businesses", () => {
    const env = { NODE_ENV: "production", ORG_FEATURES: "all", ORG_BETA_IDS: "o1, o2" }
    expect(orgFeatureEnabled("staff", "o1", env)).toBe(true)
    expect(orgFeatureEnabled("staff", "o2", env)).toBe(true)
    expect(orgFeatureEnabled("staff", "o3", env)).toBe(false)
    expect(orgFeatureEnabled("staff", null, env)).toBe(false)
    expect(orgFeatureEnabled("staff", undefined, env)).toBe(false)
  })

  it("an empty beta list means everyone", () => {
    expect(orgFeatureEnabled("staff", "anyone", { NODE_ENV: "production", ORG_FEATURES: "all", ORG_BETA_IDS: " , " })).toBe(true)
  })
})
