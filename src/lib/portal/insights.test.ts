import { describe, it, expect } from "vitest"
import { bucketKeys, bucketOf, buildFunnel, buildSeries, byService, bySource, defaultGranularity } from "@/lib/portal/insights"
import type { KpiRow } from "@/lib/portal/kpi"

const row = (o: Partial<KpiRow & { serviceType: string }> = {}): KpiRow & { serviceType: string } => ({
  source: "MARKETPLACE", status: "COMPLETED", serviceType: "MOT", totalPrice: 100, finalInvoiceValue: null,
  scheduledAt: new Date("2026-09-10T10:00:00Z"), createdAt: new Date("2026-09-05T10:00:00Z"), ...o,
})

describe("granularity and buckets", () => {
  it("picks day / week / month by range length", () => {
    expect(defaultGranularity({ from: "2026-09-20", to: "2026-10-03" })).toBe("day")
    expect(defaultGranularity({ from: "2026-07-03", to: "2026-10-03" })).toBe("week")
    expect(defaultGranularity({ from: "2025-01-01", to: "2026-10-03" })).toBe("month")
  })

  it("maps dates to bucket starts (Monday weeks, first-of-month)", () => {
    expect(bucketOf("2026-09-10", "day")).toBe("2026-09-10")
    expect(bucketOf("2026-09-10", "week")).toBe("2026-09-07")
    expect(bucketOf("2026-09-10", "month")).toBe("2026-09-01")
  })

  it("lists every bucket in the range, including quiet ones", () => {
    expect(bucketKeys({ from: "2026-09-28", to: "2026-10-02" }, "day")).toHaveLength(5)
    expect(bucketKeys({ from: "2026-09-01", to: "2026-09-30" }, "week")).toEqual(["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"])
    expect(bucketKeys({ from: "2026-01-15", to: "2026-04-02" }, "month")).toEqual(["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"])
  })
})

describe("buildSeries", () => {
  const range = { from: "2026-09-01", to: "2026-09-30" }

  it("counts created by createdAt and attended/no-show/revenue by scheduledAt, per bucket", () => {
    const series = buildSeries(
      [
        row({ finalInvoiceValue: 130 }),
        row({ status: "NO_SHOW" }),
        row({ status: "IN_PROGRESS" }),
        row({ scheduledAt: new Date("2026-09-20T10:00:00Z"), createdAt: new Date("2026-09-19T10:00:00Z") }),
      ],
      range,
      "week"
    )
    const w37 = series.find((p) => p.bucket === "2026-09-07")!
    expect(w37).toMatchObject({ created: 0, attended: 2, noShow: 1, revenue: 130 })
    expect(w37.noShowRate).toBe(33.3)
    expect(series.find((p) => p.bucket === "2026-08-31")!.created).toBe(3) // 5 Sept falls in the week starting Mon 31 Aug
    expect(series.find((p) => p.bucket === "2026-09-14")!.created).toBe(1)
    expect(series.find((p) => p.bucket === "2026-09-14")!.attended).toBe(1) // the completed 20 Sept booking
  })

  it("keeps empty buckets at zero with a null no-show rate", () => {
    const series = buildSeries([], range, "week")
    expect(series.every((p) => p.created === 0 && p.revenue === 0 && p.noShowRate === null)).toBe(true)
  })

  it("buckets on the London date, not the UTC date", () => {
    // 23:30Z on 30 Sept is 00:30 BST on 1 Oct → outside a September-only range.
    const series = buildSeries([row({ scheduledAt: new Date("2026-09-30T23:30:00Z"), createdAt: new Date("2026-09-30T23:30:00Z") })], range, "day")
    expect(series.reduce((n, p) => n + p.attended + p.created, 0)).toBe(0)
  })
})

describe("breakdowns", () => {
  const range = { from: "2026-09-01", to: "2026-09-30" }
  it("groups by source, biggest first, ignoring cancelled and out-of-range bookings", () => {
    const out = bySource(
      [row({ source: "WIDGET" }), row({ source: "WIDGET" }), row({ source: "DIRECT" }), row({ status: "CANCELLED" }), row({ scheduledAt: new Date("2026-12-01T10:00:00Z") })],
      range
    )
    expect(out.map((b) => [b.key, b.count])).toEqual([["WIDGET", 2], ["DIRECT", 1]])
  })

  it("sums revenue from completed bookings only, per service", () => {
    const out = byService([row({ serviceType: "BRAKES", totalPrice: 200 }), row({ serviceType: "BRAKES", status: "CONFIRMED" }), row({ serviceType: "MOT", totalPrice: 50 })], range)
    expect(out.find((b) => b.key === "BRAKES")).toMatchObject({ count: 2, revenue: 200 })
    expect(out[0].key).toBe("BRAKES")
  })
})

describe("buildFunnel", () => {
  it("counts requests, quotes sent and bookings, with a win rate", () => {
    const f = buildFunnel({ quoteStatuses: ["PENDING", "SENT", "ACCEPTED", "REJECTED", "ACCEPTED"], responseStatuses: ["SENT", "ACCEPTED", "DECLINED"] })
    expect(f).toEqual({ requests: 8, quoted: 6, booked: 3, winRate: 50 })
  })

  it("has no win rate when nothing was quoted", () => {
    expect(buildFunnel({ quoteStatuses: ["PENDING"], responseStatuses: [] })).toEqual({ requests: 1, quoted: 0, booked: 0, winRate: null })
  })
})
