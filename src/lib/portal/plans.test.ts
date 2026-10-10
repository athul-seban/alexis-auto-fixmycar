import { afterEach, describe, expect, it } from "vitest"
import { effectivePlan, extendFeatured, hasFeature, isFeatured, leadDecision, monthStart, PLANS } from "./plans"

const free = { plan: "FREE", subscriptionStatus: null, leadCredits: 0 }
const pro = { plan: "PRO", subscriptionStatus: "active", leadCredits: 0 }

afterEach(() => {
  delete process.env.PLANS_ENFORCED
})

describe("effectivePlan", () => {
  it("is the subscribed plan while the subscription is live", () => {
    expect(effectivePlan(pro).id).toBe("PRO")
    expect(effectivePlan({ ...pro, subscriptionStatus: "trialing" }).id).toBe("PRO")
    expect(effectivePlan({ ...pro, subscriptionStatus: "past_due" }).id).toBe("PRO")
  })
  it("falls back to FREE once cancelled, unpaid or unknown", () => {
    expect(effectivePlan({ ...pro, subscriptionStatus: "canceled" }).id).toBe("FREE")
    expect(effectivePlan({ ...pro, subscriptionStatus: null }).id).toBe("FREE")
    expect(effectivePlan({ plan: "GOLD", subscriptionStatus: "active" }).id).toBe("FREE")
  })
})

describe("plan enforcement", () => {
  it("unlocks everything and never limits leads while PLANS_ENFORCED is off", () => {
    expect(hasFeature(free, "sms")).toBe(true)
    expect(leadDecision(free, 999)).toEqual({ allowed: true, useCredit: false })
  })

  it("gates features by plan once enforced", () => {
    process.env.PLANS_ENFORCED = "true"
    expect(hasFeature(free, "sms")).toBe(false)
    expect(hasFeature(pro, "sms")).toBe(true)
  })

  it("allows leads up to the monthly limit, then spends credits, then blocks", () => {
    process.env.PLANS_ENFORCED = "true"
    const limit = PLANS.FREE.leadsPerMonth!
    expect(leadDecision(free, limit - 1)).toEqual({ allowed: true, useCredit: false })
    expect(leadDecision(free, limit)).toEqual({ allowed: false, reason: "LIMIT_REACHED" })
    expect(leadDecision({ ...free, leadCredits: 2 }, limit)).toEqual({ allowed: true, useCredit: true })
  })

  it("never limits a plan with unlimited leads", () => {
    process.env.PLANS_ENFORCED = "true"
    expect(leadDecision({ plan: "PREMIUM", subscriptionStatus: "active", leadCredits: 0 }, 5000)).toEqual({ allowed: true, useCredit: false })
  })
})

describe("featured placement", () => {
  const now = new Date("2026-10-09T12:00:00Z")
  it("is featured only until the end date", () => {
    expect(isFeatured({ featuredUntil: new Date("2026-10-10T00:00:00Z") }, now)).toBe(true)
    expect(isFeatured({ featuredUntil: new Date("2026-10-08T00:00:00Z") }, now)).toBe(false)
    expect(isFeatured({ featuredUntil: null }, now)).toBe(false)
  })
  it("extends a running placement and restarts a lapsed one", () => {
    const running = new Date("2026-10-20T00:00:00Z")
    expect(extendFeatured(running, now, 30).toISOString()).toBe("2026-11-19T00:00:00.000Z")
    expect(extendFeatured(new Date("2026-01-01T00:00:00Z"), now, 30).toISOString()).toBe("2026-11-08T12:00:00.000Z")
    expect(extendFeatured(null, now, 1).toISOString()).toBe("2026-10-10T12:00:00.000Z")
  })
})

it("monthStart is the first of the month in UTC", () => {
  expect(monthStart(new Date("2026-10-31T23:59:59Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z")
})
