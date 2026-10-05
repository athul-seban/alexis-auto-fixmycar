import { describe, expect, it } from "vitest"
import { MAX_PLATFORM_FEE_PERCENT, depositPence, platformFeePence, platformFeePercent, refundPence, toPence, toPounds } from "@/lib/portal/payments"
import { parsePortalSettings } from "@/lib/portal/portal-settings"

const on = { enabled: true, depositPercent: 25 }

describe("depositPence", () => {
  it("takes the configured percentage in pence", () => {
    expect(depositPence(200, on)).toBe(5000)
    expect(depositPence(99.99, { enabled: true, depositPercent: 10 })).toBe(1000)
  })
  it("takes nothing when disabled, free, or below the minimum charge", () => {
    expect(depositPence(200, { enabled: false, depositPercent: 25 })).toBe(0)
    expect(depositPence(0, on)).toBe(0)
    expect(depositPence(3, { enabled: true, depositPercent: 25 })).toBe(0) // 75p < £1
  })
  it("never exceeds the job price", () => {
    expect(depositPence(1.5, { enabled: true, depositPercent: 100 })).toBe(150)
  })
})

describe("money conversion", () => {
  it("round-trips pounds and pence without float drift", () => {
    expect(toPence(19.99)).toBe(1999)
    expect(toPence(0.1 + 0.2)).toBe(30)
    expect(toPounds(1999)).toBe(19.99)
  })
})

describe("refundPence", () => {
  const now = new Date("2026-10-10T10:00:00Z")
  const hoursAhead = (h: number) => new Date(now.getTime() + h * 3_600_000)
  const base = { paidPence: 5000, now }

  it("refunds a customer in full only when they cancel at least 24h ahead under UNTIL_24H", () => {
    expect(refundPence({ ...base, policy: "UNTIL_24H", cancelledBy: "CUSTOMER", scheduledAt: hoursAhead(30) })).toBe(5000)
    expect(refundPence({ ...base, policy: "UNTIL_24H", cancelledBy: "CUSTOMER", scheduledAt: hoursAhead(23) })).toBe(0)
  })
  it("follows FULL and NONE policies for customer cancellations", () => {
    expect(refundPence({ ...base, policy: "FULL", cancelledBy: "CUSTOMER", scheduledAt: hoursAhead(1) })).toBe(5000)
    expect(refundPence({ ...base, policy: "NONE", cancelledBy: "CUSTOMER", scheduledAt: hoursAhead(500) })).toBe(0)
  })
  it("always refunds in full when the garage or system cancels", () => {
    for (const cancelledBy of ["GARAGE", "SYSTEM"] as const) {
      expect(refundPence({ ...base, policy: "NONE", cancelledBy, scheduledAt: hoursAhead(1) })).toBe(5000)
    }
  })
  it("only refunds what is still unrefunded", () => {
    expect(refundPence({ ...base, policy: "FULL", cancelledBy: "GARAGE", scheduledAt: hoursAhead(1), alreadyRefundedPence: 2000 })).toBe(3000)
    expect(refundPence({ ...base, policy: "FULL", cancelledBy: "GARAGE", scheduledAt: hoursAhead(1), alreadyRefundedPence: 5000 })).toBe(0)
  })
})

describe("payment settings", () => {
  it("default to off with a 25% deposit and the 24h policy, and ignore bad stored data", () => {
    expect(parsePortalSettings(null).payments).toEqual({ enabled: false, depositPercent: 25, refundPolicy: "UNTIL_24H" })
    expect(parsePortalSettings(JSON.stringify({ payments: { depositPercent: 500 } })).payments.enabled).toBe(false)
  })
})

describe("platform fee", () => {
  it("reads PLATFORM_FEE_PERCENT and treats missing, invalid or excessive values as no fee", () => {
    expect(platformFeePercent("10")).toBe(10)
    expect(platformFeePercent("2.5")).toBe(2.5)
    for (const bad of [undefined, "", "abc", "-5", "0", String(MAX_PLATFORM_FEE_PERCENT + 1), "NaN"]) expect(platformFeePercent(bad)).toBe(0)
  })
  it("takes a rounded percentage of the deposit in pence", () => {
    expect(platformFeePence(5000, 10)).toBe(500)
    expect(platformFeePence(1999, 10)).toBe(200) // 199.9 -> 200
    expect(platformFeePence(5000, 0)).toBe(0)
  })
  it("always leaves the garage at least a penny", () => {
    expect(platformFeePence(100, 30)).toBe(30)
    expect(platformFeePence(2, 30)).toBe(1)
    expect(platformFeePence(1, 30)).toBe(0)
  })
})
